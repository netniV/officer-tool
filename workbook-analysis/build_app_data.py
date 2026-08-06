from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "STFC-Officers-Tool-reference.xlsx"
OUTPUT = ROOT / "public" / "data" / "workbook.json"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def column_number(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - 64
    return result


def cell_value(cell, shared_strings):
    value_node = cell.find("main:v", NS)
    inline_node = cell.find("main:is", NS)
    cell_type = cell.attrib.get("t")
    if inline_node is not None:
        return "".join(text.text or "" for text in inline_node.iterfind(".//main:t", NS))
    if value_node is None:
        return None
    raw = value_node.text
    if cell_type == "s" and raw is not None:
        return shared_strings[int(raw)]
    if cell_type == "b":
        return raw == "1"
    if cell_type in ("str", "e"):
        return raw
    if raw is None:
        return None
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def text(value):
    return "" if value is None else str(value).strip()


with zipfile.ZipFile(WORKBOOK) as zf:
    shared_strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for item in shared_root.findall("main:si", NS):
            shared_strings.append("".join(node.text or "" for node in item.iterfind(".//main:t", NS)))

    workbook_root = ET.fromstring(zf.read("xl/workbook.xml"))
    rel_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    relationships = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rel_root.findall("pkg:Relationship", NS)}
    sheet_paths = {}
    sheet_states = {}
    for sheet in workbook_root.findall("main:sheets/main:sheet", NS):
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = relationships[rel_id].lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        sheet_paths[sheet.attrib["name"]] = target
        sheet_states[sheet.attrib["name"]] = sheet.attrib.get("state", "visible")

    cache = {}

    def sheet_cells(name):
        if name in cache:
            return cache[name]
        root = ET.fromstring(zf.read(sheet_paths[name]))
        cells = {}
        for cell in root.iterfind(".//main:sheetData/main:row/main:c", NS):
            cells[cell.attrib["r"]] = cell_value(cell, shared_strings)
        cache[name] = cells
        return cells

    def value(cells, row, col):
        letters = ""
        number = col
        while number:
            number, remainder = divmod(number - 1, 26)
            letters = chr(65 + remainder) + letters
        return cells.get(f"{letters}{row}")

    score_cells = sheet_cells("Officer Scores")
    rarity_by_officer = {}
    score_by_officer = {}
    for row in range(1, 279):
        name = text(value(score_cells, row, 1))
        if not name:
            continue
        rarity_by_officer[name] = text(value(score_cells, row, 2))
        score_by_officer[name] = [value(score_cells, row, col) for col in range(3, 20)]

    stat_cells = sheet_cells("Officer Stats")
    stats_by_officer = {}
    for row in range(2, 280):
        name = text(value(stat_cells, row, 1))
        if not name:
            continue
        levels = []
        for level in range(1, 91):
            start_col = 2 + (level - 1) * 3
            levels.append([
                value(stat_cells, row, start_col) or 0,
                value(stat_cells, row, start_col + 1) or 0,
                value(stat_cells, row, start_col + 2) or 0,
            ])
        stats_by_officer[name] = levels

    skill_cells = sheet_cells("Officer Skills")
    officers = []
    for row in range(2, 280):
        name = text(value(skill_cells, row, 1))
        if not name:
            continue
        officers.append({
            "id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
            "name": name,
            "alternateName": text(value(skill_cells, row, 2)),
            "rarity": rarity_by_officer.get(name, ""),
            "officerAbility": text(value(skill_cells, row, 3)),
            "officerAbilityValues": [value(skill_cells, row, col) for col in range(4, 9)],
            "captainManeuver": text(value(skill_cells, row, 9)),
            "captainValue": value(skill_cells, row, 10),
            "group": text(value(skill_cells, row, 11)),
            "type": text(value(skill_cells, row, 12)),
            "fullSynergy": value(skill_cells, row, 13),
            "halfSynergy": value(skill_cells, row, 14),
            "effects": {
                "causeBurning": value(skill_cells, row, 15) == "Y",
                "useBurning": value(skill_cells, row, 16) == "Y",
                "causeBreach": value(skill_cells, row, 17) == "Y",
                "useBreach": value(skill_cells, row, 18) == "Y",
                "causeMorale": value(skill_cells, row, 19) == "Y",
                "useMorale": value(skill_cells, row, 20) == "Y",
                "causeAssimilate": value(skill_cells, row, 21) == "Y",
                "useAssimilate": value(skill_cells, row, 22) == "Y",
            },
            "belowDeck": value(skill_cells, row, 35) == "Y",
            "belowDeckAbility": text(value(skill_cells, row, 36)),
            "belowDeckValues": [value(skill_cells, row, col) for col in range(37, 42)],
            "scores": score_by_officer.get(name, []),
            "stats": stats_by_officer.get(name, []),
        })

    preset_cells = sheet_cells("Pre-Set Lookup")
    preset_filter_headers = {
        col: text(value(preset_cells, 1, col))
        for col in range(9, 29)
        if text(value(preset_cells, 1, col))
    }
    presets = []
    for row in range(2, 401):
        name = text(value(preset_cells, row, 1))
        if not name:
            continue
        presets.append({
            "name": name,
            "captain": text(value(preset_cells, row, 2)),
            "captainRank": value(preset_cells, row, 3),
            "firstOfficer": text(value(preset_cells, row, 4)),
            "firstOfficerRank": value(preset_cells, row, 5),
            "secondOfficer": text(value(preset_cells, row, 6)),
            "secondOfficerRank": value(preset_cells, row, 7),
            "notes": text(value(preset_cells, row, 8)),
            "filters": [header for col, header in preset_filter_headers.items() if value(preset_cells, row, col) is True],
        })

    ship_cells = sheet_cells("Ships")
    ships = []
    for row in range(23, 125):
        name = text(value(ship_cells, row, 2))
        if not name:
            continue
        ships.append({
            "name": name,
            "level": value(ship_cells, row, 5) or 0,
            "maxLevel": value(ship_cells, row, 6) or 0,
            "ability": text(value(ship_cells, row, 7)),
        })

    away_cells = sheet_cells("AM Lookup")
    away_missions = []
    for row in range(2, 94):
        name = text(value(away_cells, row, 1))
        if not name:
            continue
        away_missions.append({
            "name": name,
            "rarity": text(value(away_cells, row, 2)),
            "keyStat": text(value(away_cells, row, 3)),
            "primaryRewards": [text(value(away_cells, row, col)) for col in range(4, 7) if text(value(away_cells, row, col))],
            "criticalReward": text(value(away_cells, row, 7)),
            "traits": [text(value(away_cells, row, col)) for col in range(8, 12) if text(value(away_cells, row, col))],
            "duration": text(value(away_cells, row, 12)),
            "minimumCriticalChance": value(away_cells, row, 13),
            "criticalChancePerTrait": value(away_cells, row, 14),
            "traitPoints": value(away_cells, row, 15),
            "maximumCriticalChance": value(away_cells, row, 16),
        })

    app_data = {
        "metadata": {
            "sourceVersion": "1.8.M87",
            "title": "The Officer Tool by StewieDøø",
            "sourceWorkbook": WORKBOOK.name,
            "fonts": ["Oswald", "Arial", "Impact", "Inconsolata"],
            "palette": {
                "black": "#000000",
                "gold": "#F5C548",
                "lavender": "#9999CC",
                "purple": "#BF90BF",
                "sky": "#99CCFF",
                "copper": "#DDA061",
                "orange": "#FF9966",
            },
        },
        "navigation": [
            "Main", "Bonuses", "Roster", "All Docks", "Saved Setups", "Pre-Set Crews",
            "Ships", "ATA Overview", "ATA Analysis", "ATA Planning", "Migration", "Change Log",
        ],
        "officers": officers,
        "presetCrews": presets,
        "ships": ships,
        "awayMissions": away_missions,
    }

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(app_data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(json.dumps({
    "output": str(OUTPUT),
    "officers": len(officers),
    "presetCrews": len(presets),
    "ships": len(ships),
    "awayMissions": len(away_missions),
    "bytes": OUTPUT.stat().st_size,
}, indent=2))
