from __future__ import annotations

import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "STFC-Officers-Tool-reference.xlsx"
OUTPUT = Path(__file__).resolve().parent / "workbook-map.json"
MEDIA_DIR = Path(__file__).resolve().parent / "media"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}

TARGET_SHEETS = {
    "Main": 24,
    "Bonuses": 42,
    "Roster": 44,
    "All Docks": 44,
    "Saved Setups": 44,
    "Pre-Set Crews": 48,
    "Ships": 44,
    "ATA Overview": 44,
    "ATA Analysis": 48,
    "ATA Planning": 52,
    "Migration": 52,
    "Pre-Set Lookup": 12,
    "AM Lookup": 12,
    "Officer Skills": 12,
    "Officer Stats": 12,
    "Officer Scores": 12,
    "Ship Stats": 12,
    "Ship Weapons": 12,
}


def attr(node, local_name, default=None):
    if node is None:
        return default
    return node.attrib.get(local_name, default)


def colour(node):
    if node is None:
        return None
    for key in ("rgb", "theme", "indexed", "auto"):
        if key in node.attrib:
            value = node.attrib[key]
            if key == "rgb" and len(value) == 8:
                value = f"#{value[2:]}"
            return {"kind": key, "value": value, "tint": node.attrib.get("tint")}
    return None


def cell_col(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - 64
    return result


def parse_styles(zf: zipfile.ZipFile):
    root = ET.fromstring(zf.read("xl/styles.xml"))
    fonts = []
    for font in root.findall("main:fonts/main:font", NS):
        fonts.append(
            {
                "name": attr(font.find("main:name", NS), "val"),
                "size": attr(font.find("main:sz", NS), "val"),
                "bold": font.find("main:b", NS) is not None,
                "italic": font.find("main:i", NS) is not None,
                "color": colour(font.find("main:color", NS)),
            }
        )
    fills = []
    for fill in root.findall("main:fills/main:fill", NS):
        pattern = fill.find("main:patternFill", NS)
        fills.append(
            {
                "pattern": attr(pattern, "patternType") if pattern is not None else None,
                "foreground": colour(pattern.find("main:fgColor", NS)) if pattern is not None else None,
                "background": colour(pattern.find("main:bgColor", NS)) if pattern is not None else None,
            }
        )
    xfs = []
    for xf in root.findall("main:cellXfs/main:xf", NS):
        alignment = xf.find("main:alignment", NS)
        xfs.append(
            {
                "fontId": int(attr(xf, "fontId", 0)),
                "fillId": int(attr(xf, "fillId", 0)),
                "borderId": int(attr(xf, "borderId", 0)),
                "numFmtId": int(attr(xf, "numFmtId", 0)),
                "alignment": dict(alignment.attrib) if alignment is not None else {},
            }
        )
    return fonts, fills, xfs


def parse_shared_strings(zf: zipfile.ZipFile):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings = []
    for item in root.findall("main:si", NS):
        strings.append("".join(text.text or "" for text in item.iterfind(".//main:t", NS)))
    return strings


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
        index = int(raw)
        return shared_strings[index] if index < len(shared_strings) else raw
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


with zipfile.ZipFile(WORKBOOK) as zf:
    shared_strings = parse_shared_strings(zf)
    fonts, fills, xfs = parse_styles(zf)

    workbook_root = ET.fromstring(zf.read("xl/workbook.xml"))
    rel_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    relationships = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rel_root.findall("pkg:Relationship", NS)
    }

    workbook_map = {
        "title": "STFC Officers Tool",
        "sheets": [],
        "definedNames": [],
        "styles": {"fonts": fonts, "fills": fills, "cellFormats": xfs},
        "media": [name for name in zf.namelist() if name.startswith("xl/media/")],
    }

    MEDIA_DIR.mkdir(exist_ok=True)
    for media_path in workbook_map["media"]:
        (MEDIA_DIR / Path(media_path).name).write_bytes(zf.read(media_path))

    names_node = workbook_root.find("main:definedNames", NS)
    if names_node is not None:
        for defined_name in names_node:
            workbook_map["definedNames"].append(
                {
                    "name": defined_name.attrib.get("name"),
                    "sheetId": defined_name.attrib.get("localSheetId"),
                    "hidden": defined_name.attrib.get("hidden") == "1",
                    "reference": defined_name.text,
                }
            )

    for sheet in workbook_root.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib["name"]
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = relationships[rel_id].lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        sheet_root = ET.fromstring(zf.read(target))
        dimension = sheet_root.find("main:dimension", NS)
        formula_functions = Counter()
        formula_count = 0
        for formula in sheet_root.iterfind(".//main:f", NS):
            formula_count += 1
            for function in re.findall(r"(?<![A-Z0-9_.])([A-Z][A-Z0-9_.]+)\s*\(", (formula.text or "").upper()):
                formula_functions[function] += 1

        sheet_info = {
            "name": name,
            "state": sheet.attrib.get("state", "visible"),
            "path": target,
            "dimension": attr(dimension, "ref"),
            "formulaCount": formula_count,
            "formulaFunctions": formula_functions.most_common(30),
        }

        if name in TARGET_SHEETS:
            max_row = TARGET_SHEETS[name]
            cells = []
            style_frequency = Counter()
            for cell in sheet_root.iterfind(".//main:sheetData/main:row/main:c", NS):
                reference = cell.attrib.get("r", "")
                row_match = re.search(r"\d+", reference)
                if not row_match:
                    continue
                row = int(row_match.group(0))
                col = cell_col(reference)
                if row > max_row or col > 52:
                    continue
                style_id = int(cell.attrib.get("s", 0))
                formula = cell.find("main:f", NS)
                value = cell_value(cell, shared_strings)
                if value is None and formula is None:
                    continue
                style_frequency[style_id] += 1
                cells.append(
                    {
                        "ref": reference,
                        "value": value,
                        "formula": formula.text if formula is not None else None,
                        "styleId": style_id,
                    }
                )
            merges = [node.attrib["ref"] for node in sheet_root.findall("main:mergeCells/main:mergeCell", NS)]
            validations = []
            for validation in sheet_root.findall("main:dataValidations/main:dataValidation", NS):
                formula1 = validation.find("main:formula1", NS)
                formula2 = validation.find("main:formula2", NS)
                validations.append(
                    {
                        "range": validation.attrib.get("sqref"),
                        "type": validation.attrib.get("type"),
                        "allowBlank": validation.attrib.get("allowBlank"),
                        "formula1": formula1.text if formula1 is not None else None,
                        "formula2": formula2.text if formula2 is not None else None,
                    }
                )
            sheet_info.update(
                {
                    "cells": cells,
                    "mergedRanges": merges,
                    "validations": validations,
                    "styleFrequency": style_frequency.most_common(25),
                }
            )
        workbook_map["sheets"].append(sheet_info)

OUTPUT.write_text(json.dumps(workbook_map, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({
    "output": str(OUTPUT),
    "sheetCount": len(workbook_map["sheets"]),
    "definedNameCount": len(workbook_map["definedNames"]),
    "media": workbook_map["media"],
    "sheets": [
        {"name": sheet["name"], "state": sheet["state"], "dimension": sheet["dimension"], "formulaCount": sheet["formulaCount"]}
        for sheet in workbook_map["sheets"]
    ],
}, indent=2))
