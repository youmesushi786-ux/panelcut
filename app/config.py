"""Configuration settings for the panel cutting optimizer."""

from typing import Dict
import os
from dotenv import load_dotenv

load_dotenv()

# Default board dimensions in mm (standard 4x8)
DEFAULT_BOARD_WIDTH_MM = float(os.getenv("DEFAULT_BOARD_WIDTH_MM", "1220"))
DEFAULT_BOARD_LENGTH_MM = float(os.getenv("DEFAULT_BOARD_LENGTH_MM", "2440"))

# Kerf thickness in mm
DEFAULT_KERF_MM = float(os.getenv("DEFAULT_KERF_MM", "3"))

# Board prices in KES (fallbacks; detailed prices come from BOARD_PRICE_TABLE)
BOARD_PRICES: Dict[str, float] = {
    "Timsales": float(os.getenv("PRICE_TIMSALES", "4200")),
    "Comply": float(os.getenv("PRICE_COMPLY", "3400")),
    "Waterproof": float(os.getenv("PRICE_WATERPROOF", "5100")),
}

# -------- Service prices --------
# Cutting price per whole board
CUTTING_PRICE_PER_BOARD = float(os.getenv("CUTTING_PRICE_PER_BOARD", "350"))

# Factory edging price (factory supplies edging)
EDGING_PRICE_PER_METER = float(os.getenv("EDGING_PRICE_PER_METER", "75"))

# Client edging price (client supplies edging and pays labour per meter)
CLIENT_EDGING_PRICE_PER_METER = float(
    os.getenv("CLIENT_EDGING_PRICE_PER_METER", "55")
)

# -------- Tax & currency --------
# TAX_RATE is a decimal fraction: 0.16 = 16%
TAX_RATE = float(os.getenv("TAX_RATE", "0.16"))
CURRENCY = os.getenv("CURRENCY", "KES")

# ---------- Board catalog & pricing (used for selector + BOQ) ----------

# Which thicknesses and companies are allowed per core type
BOARD_CATALOG = {
    "plywood": {
        "thicknesses": [3, 6, 9, 12, 18],
        "companies": [
            "Complywood",
            "Timsales",
            "Raiply",
            "Zhongzhe",
            "Waterproof",  # Marine plywood
        ],
    },
    "mdf": {
        "thicknesses": [6, 9, 12, 18],  # (you can add 3mm MDF later if you want)
        "companies": [
            "Complywood",
            "Timsales",
            "Raiply",
            "Zhongzhe",
        ],
    },
    "chipboard": {
        "thicknesses": [6, 9, 12, 18],
        "companies": [
            "Standard Chipboard",
            "Melamine Chipboard",
            "Zhongzhe",
        ],
    },
    "waterproof": {
        "thicknesses": [6, 9, 12, 18],
        "companies": [
            "Waterproof",
        ],
    },
}

# Colors per company (can be expanded)
BOARD_COLORS = {
    "Complywood": [
        {"code": "CP-101", "name": "White", "hex": "#f5f5f5"},
        {"code": "CP-102", "name": "Light Brown", "hex": "#d2b48c"},
        {"code": "CP-103", "name": "Walnut", "hex": "#5c3b2e"},
    ],
    "Timsales": [
        {"code": "TS-101", "name": "White Matt", "hex": "#f4f4f4"},
        {"code": "TS-102", "name": "Natural", "hex": "#d4b27b"},
        {"code": "TS-103", "name": "Grey", "hex": "#a0a0a0"},
    ],
    "Raiply": [
        {"code": "RP-101", "name": "Natural", "hex": "#c9a568"},
        {"code": "RP-102", "name": "Reddish Brown", "hex": "#8b4513"},
    ],
    "Zhongzhe": [
        {"code": "ZZ-101", "name": "Brown", "hex": "#8b5a2b"},
        {"code": "ZZ-102", "name": "Light Brown", "hex": "#d2b48c"},
    ],
    "Waterproof": [
        {"code": "WP-101", "name": "Green Core", "hex": "#238636"},
        {"code": "WP-102", "name": "Dark Brown", "hex": "#4b3621"},
    ],
    "Standard Chipboard": [
        {"code": "CB-101", "name": "Light Brown", "hex": "#d2b48c"},
        {"code": "CB-102", "name": "Wood Veneer", "hex": "#c19a6b"},
    ],
    "Melamine Chipboard": [
        {"code": "MC-101", "name": "White", "hex": "#ffffff"},
        {"code": "MC-102", "name": "Beech", "hex": "#f0c987"},
        {"code": "MC-103", "name": "Oak", "hex": "#c3a16b"},
        {"code": "MC-104", "name": "Walnut", "hex": "#5c3b2e"},
    ],
}

# Price per sheet from your comparison table
# core_type -> thickness -> company -> price (KES)
BOARD_PRICE_TABLE = {
    "mdf": {
        6:  {"Complywood": 2160, "Timsales": 2100, "Raiply": 2280, "Zhongzhe": 1980},
        9:  {"Complywood": 2880, "Timsales": 2820, "Raiply": 3000, "Zhongzhe": 2640},
        12: {"Complywood": 3840, "Timsales": 3720, "Raiply": 3960, "Zhongzhe": 3480},
        18: {"Complywood": 5400, "Timsales": 5280, "Raiply": 5520, "Zhongzhe": 4920},
    },
    "plywood": {
        3:  {"Complywood": 1800, "Timsales": 1740, "Raiply": 1920, "Zhongzhe": 1560, "Waterproof": 3840},
        6:  {"Complywood": 2640, "Timsales": 2520, "Raiply": 2760, "Zhongzhe": 2280, "Waterproof": 5400},
        9:  {"Complywood": 3360, "Timsales": 3240, "Raiply": 3480, "Zhongzhe": 3000, "Waterproof": 6600},
        12: {"Complywood": 4200, "Timsales": 4080, "Raiply": 4320, "Zhongzhe": 3720, "Waterproof": 8160},
        18: {"Complywood": 6240, "Timsales": 6000, "Raiply": 6360, "Zhongzhe": 5520, "Waterproof": 11040},
    },
    "chipboard": {
        6:  {"Zhongzhe": 1320, "Standard Chipboard": 1440},
        9:  {"Zhongzhe": 1800, "Standard Chipboard": 1920},
        12: {"Zhongzhe": 2280, "Standard Chipboard": 2520, "Melamine Chipboard": 3600},
        18: {"Zhongzhe": 3360, "Standard Chipboard": 3840, "Melamine Chipboard": 5040},
    },
    "waterproof": {
        6:  {"Waterproof": 3360},
        9:  {"Waterproof": 3840},
        12: {"Waterproof": 5040},
        18: {"Waterproof": 6960},
    },
}

# Company info (for BOQ, email / WhatsApp notifications)
COMPANY_INFO = {
    "name": os.getenv("COMPANY_NAME", "Panel Pro Cutters Ltd"),
    "address": os.getenv("COMPANY_ADDRESS", "Industrial Area, Nairobi"),
    "phone": os.getenv("COMPANY_PHONE", "+254 700 123 456"),
    "email": os.getenv("COMPANY_EMAIL", "info@panelpro.co.ke"),
    "whatsapp": os.getenv("COMPANY_WHATSAPP", "2547XXXXXXXX"),
}