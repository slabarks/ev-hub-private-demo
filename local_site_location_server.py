#!/usr/bin/env python3
"""
EV Hub Investment Tool local test server.

No venv and no pip install required. Uses only Python standard library.

Run:
    python local_site_location_server.py

Then open:
    http://localhost:10314/
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import hmac
import io
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "10314"))
USER_AGENT = "EVHubSiteLocationPrototype/0.1 (local test; contact: local@example.com)"
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "").strip()
DEMO_SESSION_SECRET = os.environ.get("DEMO_SESSION_SECRET", DEMO_PASSWORD or "local-dev-secret")
DEMO_AUTH_COOKIE = "evhub_demo_auth"
DEMO_AUTH_MAX_AGE = 60 * 60 * 12


LOCAL_DATASETS = {
    "model_farm": {
        "match": ["model farm", "t12 t326", "lee auto"],
        "site": {"name": "Model Farm Road, Cork, Ireland", "lat": 51.8883433, "lon": -8.5138407, "source": "local validation geocoder"},
        "traffic": {"aadt": 22000, "source": "Curated validation seed / local road-class estimate", "confidence": "validation"},
        "chargers": [
            {"name": "Model Farm Road Local Charger", "address": "Model Farm Road, Cork", "lat": 51.8899, "lon": -8.5163, "operator": "Validation dataset", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Wilton Shopping Centre", "address": "Sarsfield Road, Wilton, Cork", "lat": 51.8813, "lon": -8.5089, "operator": "ESB eCars / validation", "status": "Operational", "units": 4, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 1, "power": 50}, {"type": "CHAdeMO", "quantity": 1, "power": 50}, {"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "CUH / Wilton Area", "address": "Bishopstown Road, Cork", "lat": 51.8834, "lon": -8.5106, "operator": "Validation dataset", "status": "Status unknown", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Bishopstown Retail Park", "address": "Bishopstown, Cork", "lat": 51.8845, "lon": -8.5353, "operator": "Validation dataset", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 1, "power": 50}, {"type": "Type 2", "quantity": 1, "power": 22}]},
            {"name": "Ballincollig Road Rapid Site", "address": "Carrigrohane Road, Cork", "lat": 51.8916, "lon": -8.5598, "operator": "Validation dataset", "status": "Operational", "units": 4, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 2, "power": 180}, {"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Cork City Centre Rapid Site", "address": "Grand Parade, Cork City", "lat": 51.9036, "lon": -8.4756, "operator": "ESB eCars / validation", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 1, "power": 50}, {"type": "CHAdeMO", "quantity": 1, "power": 50}]},
        ],
    },

    "little_island_eastgate": {
        "match": ["eastgate", "eastgate drive", "little island", "kilcoolishal", "t45 kx50", "52 eastgate"],
        "site": {
            "name": "52 Eastgate Drive, Little Island, Cork, T45 KX50",
            "lat": 51.90345,
            "lon": -8.36909,
            "source": "local validation geocoder - Eastgate Drive approximate"
        },
        "traffic": {
            "aadt": 18000,
            "source": "Curated validation seed / N25-R623 local road-class estimate",
            "confidence": "validation"
        },
        "chargers": [
            {
                "name": "ePower - 52 Eastgate Drive",
                "address": "52 Eastgate Drive, Little Island, Cork, T45 KX50",
                "lat": 51.90345,
                "lon": -8.36909,
                "operator": "ePower / validation",
                "status": "Operational",
                "units": 1,
                "source": "Curated validation seed based on public listing",
                "confidence": "validation",
                "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]
            },
            {
                "name": "Eastgate Business Park Local AC",
                "address": "Eastgate Business Park, Little Island, Cork",
                "lat": 51.90339,
                "lon": -8.36996,
                "operator": "Validation dataset",
                "status": "Status unknown",
                "units": 1,
                "source": "Curated validation seed",
                "confidence": "validation",
                "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]
            },
            {
                "name": "Mahon Point Shopping Centre",
                "address": "Mahon Point Retail Park, Mahon, Cork",
                "lat": 51.8877,
                "lon": -8.3902,
                "operator": "Tesla / ESB eCars area",
                "status": "Operational",
                "units": 4,
                "source": "Curated validation seed",
                "confidence": "validation",
                "connectors": [{"type": "CCS2", "quantity": 4, "power": 250}, {"type": "Type 2", "quantity": 2, "power": 22}]
            },
            {
                "name": "Mahon Point Car Park",
                "address": "Mahon Point, Cork",
                "lat": 51.8868,
                "lon": -8.3923,
                "operator": "ESB eCars / validation",
                "status": "Operational",
                "units": 2,
                "source": "Curated validation seed",
                "confidence": "validation",
                "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]
            },
            {
                "name": "Douglas Village Shopping Centre",
                "address": "Douglas, Cork",
                "lat": 51.8789,
                "lon": -8.4352,
                "operator": "ESB eCars / validation",
                "status": "Operational",
                "units": 3,
                "source": "Curated validation seed",
                "confidence": "validation",
                "connectors": [{"type": "CCS2", "quantity": 1, "power": 100}, {"type": "CCS2", "quantity": 1, "power": 50}, {"type": "Type 2", "quantity": 1, "power": 22}]
            }
        ],
    },
    "mahon": {
        "match": ["mahon"],
        "site": {"name": "Mahon Link Road, Cork", "lat": 51.8859, "lon": -8.3932, "source": "local validation geocoder"},
        "traffic": {"aadt": 39800, "source": "Curated validation seed / local road-class estimate", "confidence": "validation"},
        "chargers": [
            {"name": "Mahon Point Car Park", "address": "Mahon Point, Cork", "lat": 51.8868, "lon": -8.3923, "operator": "ESB eCars", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Mahon Point Shopping Centre", "address": "Mahon Point Retail Park, Mahon, Cork", "lat": 51.8877, "lon": -8.3902, "operator": "Tesla / ESB eCars area", "status": "Operational", "units": 4, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 4, "power": 250}, {"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Tesco Mahon", "address": "Mahon, Cork", "lat": 51.8861, "lon": -8.3975, "operator": "ESB eCars", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "Type 2", "quantity": 2, "power": 7}]},
            {"name": "Douglas Village Shopping Centre", "address": "Douglas, Cork", "lat": 51.8789, "lon": -8.4352, "operator": "ESB eCars", "status": "Operational", "units": 3, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 1, "power": 100}, {"type": "CCS2", "quantity": 1, "power": 50}, {"type": "Type 2", "quantity": 1, "power": 22}]},
        ],
    },
    "douglas": {
        "match": ["douglas"],
        "site": {"name": "Douglas, Cork", "lat": 51.8789, "lon": -8.4352, "source": "local validation geocoder"},
        "traffic": {"aadt": 24000, "source": "Curated validation seed / local road-class estimate", "confidence": "validation"},
        "chargers": [
            {"name": "Douglas Village Shopping Centre", "address": "Douglas, Cork", "lat": 51.8789, "lon": -8.4352, "operator": "ESB eCars / validation", "status": "Operational", "units": 3, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 1, "power": 100}, {"type": "CCS2", "quantity": 1, "power": 50}, {"type": "Type 2", "quantity": 1, "power": 22}]},
            {"name": "Mahon Point Shopping Centre", "address": "Mahon Point Retail Park, Mahon, Cork", "lat": 51.8877, "lon": -8.3902, "operator": "Tesla / ESB eCars area", "status": "Operational", "units": 4, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 4, "power": 250}, {"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Grand Parade", "address": "Grand Parade, Cork City", "lat": 51.9036, "lon": -8.4756, "operator": "ESB eCars / validation", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 1, "power": 50}, {"type": "CHAdeMO", "quantity": 1, "power": 50}]},
        ],
    },
    "ballincollig": {
        "match": ["ballincollig", "p31"],
        "site": {"name": "Ballincollig, Cork", "lat": 51.8879, "lon": -8.5920, "source": "local validation geocoder"},
        "traffic": {"aadt": 39800, "source": "Legacy local fallback only — TII lookup is preferred", "confidence": "local fallback"},
        "chargers": [
            {"name": "Ballincollig Town Centre Charger", "address": "Ballincollig, Cork", "lat": 51.8888, "lon": -8.5901, "operator": "Validation dataset", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Ballincollig Road Rapid Site", "address": "Carrigrohane Road, Cork", "lat": 51.8916, "lon": -8.5598, "operator": "Validation dataset", "status": "Operational", "units": 4, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "CCS2", "quantity": 2, "power": 180}, {"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Model Farm Road Local Charger", "address": "Model Farm Road, Cork", "lat": 51.8899, "lon": -8.5163, "operator": "Validation dataset", "status": "Operational", "units": 2, "source": "Curated validation seed", "confidence": "validation", "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]},
        ],
    },

    "dublin_airport": {
        "match": ["dublin airport", "dublinairport", "airport dublin", "k67", "collinstown"],
        "site": {"name": "Dublin Airport, County Dublin", "lat": 53.4213, "lon": -6.2701, "source": "local fallback geocoder - Dublin Airport"},
        "traffic": {"aadt": 61104, "source": "Uploaded TII AADT Excel / Dublin Airport corridor fallback", "confidence": "local fallback"},
        "chargers": [
            {
                "name": "Dublin Airport Terminal 2 Car Park",
                "address": "Terminal 2 Car Park, Dublin Airport, K67 K7Y4",
                "lat": 53.4256,
                "lon": -6.2409,
                "operator": "ePower / public listing validation",
                "status": "Operational status should be verified live",
                "units": 6,
                "source": "Curated fallback from public EV listing",
                "confidence": "validation fallback",
                "connectors": [{"type": "Type 2", "quantity": 12, "power": 11}]
            },
            {
                "name": "Radisson Blu Hotel Dublin Airport",
                "address": "Dublin Airport, County Dublin",
                "lat": 53.4286,
                "lon": -6.2356,
                "operator": "ePower / public listing validation",
                "status": "Operational status should be verified live",
                "units": 6,
                "source": "Curated fallback from public EV listing",
                "confidence": "validation fallback",
                "connectors": [{"type": "Connector", "quantity": 6, "power": None}]
            },
            {
                "name": "Dublin Airport Express Red Car Park",
                "address": "Eastlands Road, Dublin Airport",
                "lat": 53.4127,
                "lon": -6.2243,
                "operator": "Public listing validation",
                "status": "Operational status should be verified live",
                "units": 1,
                "source": "Curated fallback from public EV listing",
                "confidence": "validation fallback",
                "connectors": [{"type": "CCS2", "quantity": 1, "power": 50}, {"type": "CHAdeMO", "quantity": 1, "power": 50}]
            }
        ]
    },
    "cork_airport": {
        "match": ["cork airport", "corkairport", "airport cork", "ballycurreen", "t12"],
        "site": {"name": "Cork Airport, County Cork", "lat": 51.8413, "lon": -8.4911, "source": "local fallback geocoder - Cork Airport"},
        "traffic": {"aadt": 16000, "source": "Uploaded TII AADT Excel / N27 Cork Airport corridor fallback", "confidence": "local fallback"},
        "chargers": [
            {
                "name": "Cork Airport Short Term Car Park",
                "address": "Short Term Car Park, Cork Airport",
                "lat": 51.8424,
                "lon": -8.4905,
                "operator": "ePower / Cork Airport public listing",
                "status": "Operational status should be verified live",
                "units": 6,
                "source": "Curated fallback from Cork Airport public EV charging listing",
                "confidence": "validation fallback",
                "connectors": [{"type": "DC fast", "quantity": 12, "power": 50}]
            },
            {
                "name": "Avenue 6000 Cork Airport Business Park",
                "address": "Cork Airport Business Park, Cork",
                "lat": 51.8497,
                "lon": -8.4884,
                "operator": "ePower / public listing validation",
                "status": "Operational status should be verified live",
                "units": 1,
                "source": "Curated fallback from public EV listing",
                "confidence": "validation fallback",
                "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]
            }
        ]
    },

    "newmarket_cork": {
        "match": ["newmarket", "newmarket co cork", "newmarket county cork", "main street newmarket", "church street newmarket", "new street newmarket", "lower road newmarket", "west end newmarket", "p51 wc83", "p51 x38a", "p51 tf29"],
        "site": {"name": "Newmarket, County Cork", "lat": 52.2159, "lon": -9.0007, "source": "local validation geocoder - Newmarket Co. Cork fallback", "confidence": "validation fallback"},
        "traffic": {"aadt": 7000, "source": "Curated Newmarket fallback / local road-class estimate; validate with TII import for investment use", "confidence": "local fallback"},
        "chargers": [
            {"name": "Newmarket Town Centre fallback", "address": "Main Street, Newmarket, County Cork", "lat": 52.2159, "lon": -9.0007, "operator": "Validation dataset", "status": "Status should be verified live", "units": 1, "source": "Curated fallback for address validation", "confidence": "fallback", "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Charleville area rapid fallback", "address": "Charleville, County Cork", "lat": 52.3558, "lon": -8.6836, "operator": "Public network / validation fallback", "status": "Status should be verified live", "units": 2, "source": "Regional fallback", "confidence": "fallback", "connectors": [{"type": "CCS2", "quantity": 2, "power": 50}, {"type": "Type 2", "quantity": 2, "power": 22}]}
        ]
    },

    "muckross_killarney": {
        "match": ["muckross", "muckross road", "muckross house", "muckross killarney", "killarney co kerry", "killarney county kerry"],
        "site": {"name": "Muckross / Killarney, County Kerry", "lat": 52.0246, "lon": -9.5043, "source": "local validation geocoder - Muckross/Killarney fallback", "confidence": "validation fallback"},
        "traffic": {"aadt": 8481, "source": "Uploaded TII AADT Summary Excel text corridor match / Muckross-Killarney fallback", "confidence": "local fallback / verify with TII map"},
        "chargers": [
            {"name": "Killarney town centre fallback", "address": "Killarney, County Kerry", "lat": 52.0599, "lon": -9.5044, "operator": "Validation dataset", "status": "Status should be verified live", "units": 2, "source": "Curated fallback for address validation", "confidence": "fallback", "connectors": [{"type": "Type 2", "quantity": 2, "power": 22}]},
            {"name": "Muckross Road area fallback", "address": "Muckross Road, Killarney, County Kerry", "lat": 52.0457, "lon": -9.5005, "operator": "Validation dataset", "status": "Status should be verified live", "units": 1, "source": "Curated fallback for map centering", "confidence": "fallback", "connectors": [{"type": "CCS2", "quantity": 1, "power": 50}, {"type": "Type 2", "quantity": 1, "power": 22}]}
        ]
    },
    "shannon_airport": {
        "match": ["shannon airport", "shannonairport", "airport shannon"],
        "site": {"name": "Shannon Airport, County Clare", "lat": 52.7020, "lon": -8.9248, "source": "local fallback geocoder - Shannon Airport"},
        "traffic": {"aadt": 12000, "source": "Local fallback / TII corridor match recommended", "confidence": "local fallback"},
        "chargers": []
    },
}


def local_match(address: str):
    lower = " ".join(address.lower().replace(",", " ").replace(".", " ").split())
    compact = lower.replace(" ", "")
    for dataset in LOCAL_DATASETS.values():
        terms = dataset["match"]
        if any(term in lower for term in terms):
            return dataset
        # Catch Eircodes and compact forms such as T45KX50.
        if any(term.replace(" ", "") in compact for term in terms):
            return dataset
    return None



# Gazetteer fallback used when free/open geocoders are unavailable or fail.
# This is intentionally a nearest-place fallback, not a rooftop geocoder. It prevents
# the map from incorrectly staying at the Ireland-centre fallback for common Irish
# town/county searches and keeps the first screen credible when provider APIs fail.
KNOWN_PLACE_FALLBACKS = [
    # High-specificity / app validation places first
    (["muckross", "killarney"], {"name": "Muckross / Killarney, County Kerry", "lat": 52.0246, "lon": -9.5043}),
    (["muckross"], {"name": "Muckross, County Kerry", "lat": 52.0246, "lon": -9.5043}),
    (["killarney", "kerry"], {"name": "Killarney, County Kerry", "lat": 52.0599, "lon": -9.5044}),
    (["newmarket", "cork"], {"name": "Newmarket, County Cork", "lat": 52.2159, "lon": -9.0007}),
    (["newmarket"], {"name": "Newmarket, County Cork", "lat": 52.2159, "lon": -9.0007}),
    (["dunmanway"], {"name": "Dunmanway, County Cork", "lat": 51.7206, "lon": -9.1126}),
    (["little", "island"], {"name": "Little Island, County Cork", "lat": 51.9074, "lon": -8.3543}),
    (["eastgate"], {"name": "Eastgate, Little Island, County Cork", "lat": 51.90345, "lon": -8.36909}),
    (["mahon", "cork"], {"name": "Mahon, Cork", "lat": 51.8859, "lon": -8.3932}),
    (["ballincollig"], {"name": "Ballincollig, County Cork", "lat": 51.8879, "lon": -8.5920}),
    (["mallow"], {"name": "Mallow, County Cork", "lat": 52.1347, "lon": -8.6451}),
    (["bandon"], {"name": "Bandon, County Cork", "lat": 51.7460, "lon": -8.7420}),
    (["bantry"], {"name": "Bantry, County Cork", "lat": 51.6801, "lon": -9.4526}),
    (["clonakilty"], {"name": "Clonakilty, County Cork", "lat": 51.6231, "lon": -8.8702}),
    (["skibbereen"], {"name": "Skibbereen, County Cork", "lat": 51.5500, "lon": -9.2667}),
    (["midleton"], {"name": "Midleton, County Cork", "lat": 51.9153, "lon": -8.1805}),
    (["carrigaline"], {"name": "Carrigaline, County Cork", "lat": 51.8117, "lon": -8.3986}),
    (["cobh"], {"name": "Cobh, County Cork", "lat": 51.8505, "lon": -8.2940}),
    (["fermoy"], {"name": "Fermoy, County Cork", "lat": 52.1358, "lon": -8.2758}),
    (["charleville"], {"name": "Charleville, County Cork", "lat": 52.3558, "lon": -8.6836}),
    (["macroom"], {"name": "Macroom, County Cork", "lat": 51.9066, "lon": -8.9580}),
    (["kanturk"], {"name": "Kanturk, County Cork", "lat": 52.1667, "lon": -8.9000}),
    (["millstreet"], {"name": "Millstreet, County Cork", "lat": 52.0608, "lon": -9.0608}),
    (["youghal"], {"name": "Youghal, County Cork", "lat": 51.9539, "lon": -7.8506}),
    # Airports / transport anchors
    (["dublin", "airport"], {"name": "Dublin Airport", "lat": 53.4264, "lon": -6.2499}),
    (["cork", "airport"], {"name": "Cork Airport", "lat": 51.8413, "lon": -8.4911}),
    (["shannon", "airport"], {"name": "Shannon Airport", "lat": 52.7020, "lon": -8.9248}),
    # Major cities / towns and county centres
    (["dublin"], {"name": "Dublin", "lat": 53.3498, "lon": -6.2603}),
    (["cork"], {"name": "Cork City", "lat": 51.8985, "lon": -8.4756}),
    (["galway"], {"name": "Galway, County Galway", "lat": 53.2707, "lon": -9.0568}),
    (["limerick"], {"name": "Limerick, County Limerick", "lat": 52.6638, "lon": -8.6267}),
    (["waterford"], {"name": "Waterford, County Waterford", "lat": 52.2593, "lon": -7.1101}),
    (["kilkenny"], {"name": "Kilkenny", "lat": 52.6541, "lon": -7.2448}),
    (["tralee"], {"name": "Tralee, County Kerry", "lat": 52.2713, "lon": -9.7026}),
    (["kenmare"], {"name": "Kenmare, County Kerry", "lat": 51.8796, "lon": -9.5840}),
    (["listowel"], {"name": "Listowel, County Kerry", "lat": 52.4464, "lon": -9.4850}),
    (["dingle"], {"name": "Dingle, County Kerry", "lat": 52.1408, "lon": -10.2689}),
    (["athlone"], {"name": "Athlone", "lat": 53.4239, "lon": -7.9407}),
    (["mullingar"], {"name": "Mullingar", "lat": 53.5250, "lon": -7.3381}),
    (["tullamore"], {"name": "Tullamore", "lat": 53.2739, "lon": -7.4889}),
    (["portlaoise"], {"name": "Portlaoise", "lat": 53.0344, "lon": -7.2998}),
    (["naas"], {"name": "Naas", "lat": 53.2206, "lon": -6.6593}),
    (["newbridge"], {"name": "Newbridge, County Kildare", "lat": 53.1819, "lon": -6.7967}),
    (["carlow"], {"name": "Carlow", "lat": 52.8365, "lon": -6.9341}),
    (["enniscorthy"], {"name": "Enniscorthy", "lat": 52.5008, "lon": -6.5578}),
    (["wexford"], {"name": "Wexford", "lat": 52.3369, "lon": -6.4633}),
    (["arklow"], {"name": "Arklow", "lat": 52.7931, "lon": -6.1417}),
    (["wicklow"], {"name": "Wicklow", "lat": 52.9808, "lon": -6.0446}),
    (["bray"], {"name": "Bray", "lat": 53.2044, "lon": -6.1092}),
    (["drogheda"], {"name": "Drogheda", "lat": 53.7179, "lon": -6.3561}),
    (["dundalk"], {"name": "Dundalk", "lat": 54.0090, "lon": -6.4049}),
    (["navan"], {"name": "Navan", "lat": 53.6538, "lon": -6.6814}),
    (["kells"], {"name": "Kells, County Meath", "lat": 53.7270, "lon": -6.8792}),
    (["cavan"], {"name": "Cavan", "lat": 53.9908, "lon": -7.3606}),
    (["monaghan"], {"name": "Monaghan", "lat": 54.2492, "lon": -6.9683}),
    (["sligo"], {"name": "Sligo", "lat": 54.2766, "lon": -8.4761}),
    (["letterkenny"], {"name": "Letterkenny", "lat": 54.9503, "lon": -7.7341}),
    (["donegal"], {"name": "Donegal Town", "lat": 54.6538, "lon": -8.1096}),
    (["castlebar"], {"name": "Castlebar", "lat": 53.8560, "lon": -9.2988}),
    (["westport"], {"name": "Westport", "lat": 53.8000, "lon": -9.5167}),
    (["ballina"], {"name": "Ballina, County Mayo", "lat": 54.1149, "lon": -9.1551}),
    (["tuam"], {"name": "Tuam", "lat": 53.5167, "lon": -8.8500}),
    (["ennis"], {"name": "Ennis", "lat": 52.8463, "lon": -8.9807}),
    (["nenagh"], {"name": "Nenagh", "lat": 52.8619, "lon": -8.1967}),
    (["thurles"], {"name": "Thurles", "lat": 52.6819, "lon": -7.8022}),
    (["clonmel"], {"name": "Clonmel", "lat": 52.3550, "lon": -7.7039}),
    (["tipperary"], {"name": "Tipperary Town", "lat": 52.4736, "lon": -8.1619}),
]


def known_place_fallback(address: str):
    lower = " ".join(str(address or "").lower().replace(",", " ").replace(".", " ").split())
    compact = lower.replace(" ", "")
    for terms, place in KNOWN_PLACE_FALLBACKS:
        if all((term in lower) or (term.replace(" ", "") in compact) for term in terms):
            site = dict(place)
            site.update({
                "source": "Irish town/place gazetteer fallback after free geocoder failure",
                "confidence": "nearest known place fallback",
                "match_type": "known-place-centroid",
            })
            return site
    return None

def http_json(url: str, timeout: float = 8.0, method: str = "GET", data: bytes | None = None, content_type: str | None = None):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
    return json.loads(raw.decode("utf-8", errors="replace"))



def config_status():
    return {
        "autoaddress_configured": bool(os.environ.get("AUTOADDRESS_API_KEY") and os.environ.get("AUTOADDRESS_GEOCODE_URL")),
        "geodirectory_configured": bool(os.environ.get("GEODIRECTORY_API_KEY") and os.environ.get("GEODIRECTORY_GEOCODE_URL")),
        "google_configured": bool(os.environ.get("GOOGLE_GEOCODING_API_KEY")),
        "mapbox_configured": bool(os.environ.get("MAPBOX_ACCESS_TOKEN")),
        "open_fallbacks": ["Photon", "Nominatim"],
    }

def _normalise_provider_result(name, lat, lon, source, confidence="unknown", match_type="unknown", raw=None, attempts=None):
    return {"name": name, "lat": float(lat), "lon": float(lon), "source": source, "confidence": confidence, "match_type": match_type, "raw": raw or {}, "attempts": attempts or []}

def geocode_autoaddress(address: str):
    api_key = os.environ.get("AUTOADDRESS_API_KEY")
    base_url = os.environ.get("AUTOADDRESS_GEOCODE_URL")
    if not api_key or not base_url:
        raise RuntimeError("Autoaddress not configured. Set AUTOADDRESS_API_KEY and AUTOADDRESS_GEOCODE_URL.")
    url = base_url + ("&" if "?" in base_url else "?") + urllib.parse.urlencode({"q": address, "key": api_key})
    data = http_json(url, timeout=5)
    lat = data.get("lat") or data.get("latitude")
    lon = data.get("lon") or data.get("lng") or data.get("longitude")
    if lat is None or lon is None:
        raise RuntimeError("Autoaddress response did not contain coordinates.")
    name = data.get("address") or data.get("formatted_address") or data.get("display_name") or address
    return _normalise_provider_result(name, lat, lon, "Autoaddress", data.get("confidence", "provider"), data.get("match_type", data.get("type", "provider")), data)

def geocode_geodirectory(address: str):
    api_key = os.environ.get("GEODIRECTORY_API_KEY")
    base_url = os.environ.get("GEODIRECTORY_GEOCODE_URL")
    if not api_key or not base_url:
        raise RuntimeError("GeoDirectory not configured. Set GEODIRECTORY_API_KEY and GEODIRECTORY_GEOCODE_URL.")
    url = base_url + ("&" if "?" in base_url else "?") + urllib.parse.urlencode({"q": address, "key": api_key})
    data = http_json(url, timeout=5)
    lat = data.get("lat") or data.get("latitude")
    lon = data.get("lon") or data.get("lng") or data.get("longitude")
    if lat is None or lon is None:
        raise RuntimeError("GeoDirectory response did not contain coordinates.")
    name = data.get("address") or data.get("formatted_address") or data.get("display_name") or address
    return _normalise_provider_result(name, lat, lon, "GeoDirectory / GeoAddress", data.get("confidence", "provider"), data.get("match_type", data.get("type", "provider")), data)

def geocode_google(address: str):
    key = os.environ.get("GOOGLE_GEOCODING_API_KEY")
    if not key:
        raise RuntimeError("Google Geocoding not configured. Set GOOGLE_GEOCODING_API_KEY.")
    url = "https://maps.googleapis.com/maps/api/geocode/json?" + urllib.parse.urlencode({"address": address, "region": "ie", "components": "country:IE", "key": key})
    data = http_json(url, timeout=5)
    status = data.get("status")
    if status != "OK" or not data.get("results"):
        raise RuntimeError(f"Google returned {status}: {data.get('error_message', 'no results')}")
    result = data["results"][0]
    loc = result["geometry"]["location"]
    location_type = result.get("geometry", {}).get("location_type", "unknown")
    confidence = {"ROOFTOP":"high", "RANGE_INTERPOLATED":"medium", "GEOMETRIC_CENTER":"medium-low", "APPROXIMATE":"low"}.get(location_type, "provider")
    return _normalise_provider_result(result.get("formatted_address", address), loc["lat"], loc["lng"], "Google Geocoding", confidence, location_type, {"place_id": result.get("place_id"), "types": result.get("types"), "location_type": location_type})

def geocode_mapbox(address: str):
    token = os.environ.get("MAPBOX_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("Mapbox not configured. Set MAPBOX_ACCESS_TOKEN.")
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{urllib.parse.quote(address)}.json?" + urllib.parse.urlencode({"access_token": token, "country":"ie", "limit":"1", "types":"address,poi,postcode,place,locality,neighborhood"})
    data = http_json(url, timeout=5)
    features = data.get("features", [])
    if not features:
        raise RuntimeError("Mapbox returned no results.")
    f = features[0]
    coords = f.get("center") or f.get("geometry", {}).get("coordinates")
    if not coords or len(coords) < 2:
        raise RuntimeError("Mapbox response did not contain coordinates.")
    relevance = f.get("relevance")
    confidence = "high" if relevance and relevance >= .9 else "medium" if relevance and relevance >= .75 else "low"
    return _normalise_provider_result(f.get("place_name", address), coords[1], coords[0], "Mapbox Geocoding", confidence, ",".join(f.get("place_type", [])) or "provider", {"id": f.get("id"), "relevance": relevance, "place_type": f.get("place_type")})

def geocode_local(address: str):
    dataset = local_match(address)
    if not dataset:
        raise RuntimeError("No local validation seed matched.")
    site = dataset["site"]
    return _normalise_provider_result(site["name"], site["lat"], site["lon"], site.get("source", "local validation geocoder"), "validation", "local-seed", {"matched_local_seed": True})

def geocode_photon(address: str):
    photon_url = "https://photon.komoot.io/api/?" + urllib.parse.urlencode({"q": f"{address}, Ireland", "limit":"1", "lang":"en"})
    data = http_json(photon_url, timeout=5)
    features = data.get("features", [])
    if not features:
        raise RuntimeError("Photon returned zero features.")
    f = features[0]
    props = f.get("properties", {})
    coords = f.get("geometry", {}).get("coordinates", [])
    if len(coords) < 2:
        raise RuntimeError("Photon result did not contain coordinates.")
    name = ", ".join([x for x in [props.get("name"), props.get("street"), props.get("city"), props.get("country")] if x]) or address
    return _normalise_provider_result(name, coords[1], coords[0], "Photon / OpenStreetMap", "open-fallback", props.get("osm_value", "open-fallback"), {"osm_id": props.get("osm_id"), "osm_type": props.get("osm_type")})

def geocode_nominatim(address: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"format":"jsonv2", "limit":"1", "countrycodes":"ie", "q":address})
    data = http_json(url, timeout=5)
    if not data:
        raise RuntimeError("Nominatim returned zero results.")
    first = data[0]
    return _normalise_provider_result(first.get("display_name", address), first["lat"], first["lon"], "Nominatim / OpenStreetMap", first.get("importance", "open-fallback"), first.get("type", first.get("class", "open-fallback")), {"osm_id": first.get("osm_id"), "osm_type": first.get("osm_type"), "class": first.get("class"), "type": first.get("type")})

def geocode(address: str):
    attempts = []
    providers = [
        ("local validation geocoder", geocode_local),
        ("Autoaddress", geocode_autoaddress),
        ("GeoDirectory / GeoAddress", geocode_geodirectory),
        ("Google Geocoding", geocode_google),
        ("Mapbox Geocoding", geocode_mapbox),
        ("Photon", geocode_photon),
        ("Nominatim", geocode_nominatim),
    ]
    for provider_name, provider_func in providers:
        try:
            result = provider_func(address)
            result["attempts"] = attempts + [{"provider": provider_name, "status": "ok"}]
            return result, result["attempts"]
        except Exception as exc:
            attempts.append({"provider": provider_name, "status": "failed_or_skipped", "error": str(exc)})
    raise RuntimeError(f"Address could not be resolved. Attempts: {attempts}")


def haversine_km(lat1, lon1, lat2, lon2):
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def with_distances(site, chargers):
    rows = []
    for charger in chargers:
        row = dict(charger)
        row["distance_km"] = round(haversine_km(site["lat"], site["lon"], row["lat"], row["lon"]), 3)
        rows.append(row)
    return sorted(rows, key=lambda x: x["distance_km"])


def parse_power_kw(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    import re
    text = str(value).lower().replace(",", ".")
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", text)]
    if not nums:
        return None
    value = max(nums)
    if "w" in text and "kw" not in text and value > 1000:
        value = value / 1000
    return round(value, 1)


def parse_qty(value):
    if value is None:
        return 0
    import re
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else 0


def parse_osm_connectors(tags):
    keys = [
        ("socket:ccs", "CCS"),
        ("socket:ccs2", "CCS2"),
        ("socket:type2", "Type 2"),
        ("socket:type2_combo", "CCS2"),
        ("socket:chademo", "CHAdeMO"),
        ("socket:tesla_supercharger", "Tesla Supercharger"),
        ("socket:tesla_destination", "Tesla Destination"),
        ("socket:type1", "Type 1"),
        ("socket:schuko", "Schuko"),
    ]
    connectors = []
    for key, label in keys:
        qty = parse_qty(tags.get(key))
        if qty:
            power = (
                parse_power_kw(tags.get(f"{key}:output"))
                or parse_power_kw(tags.get(f"{key}:power"))
                or parse_power_kw(tags.get("output"))
                or parse_power_kw(tags.get("power"))
            )
            connectors.append({"type": label, "quantity": qty, "power": power})
    if connectors:
        return connectors
    capacity = parse_qty(tags.get("capacity"))
    output = parse_power_kw(tags.get("output") or tags.get("power"))
    if capacity or output:
        return [{"type": "Connector", "quantity": capacity or 1, "power": output}]
    return [{"type": "Connector", "quantity": 0, "power": None}]


def overpass_chargers(site, radius_km):
    radius_m = int(float(radius_km) * 1000)
    query = f"""
[out:json][timeout:8];
(
  node["amenity"="charging_station"](around:{radius_m},{site['lat']},{site['lon']});
  way["amenity"="charging_station"](around:{radius_m},{site['lat']},{site['lon']});
  relation["amenity"="charging_station"](around:{radius_m},{site['lat']},{site['lon']});
);
out center tags;
"""
    body = ("data=" + urllib.parse.quote(query)).encode("utf-8")
    data = http_json(
        "https://overpass-api.de/api/interpreter",
        timeout=4,
        method="POST",
        data=body,
        content_type="application/x-www-form-urlencoded;charset=UTF-8",
    )
    rows = []
    for element in data.get("elements", []):
        tags = element.get("tags", {})
        lat = element.get("lat") or element.get("center", {}).get("lat")
        lon = element.get("lon") or element.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        rows.append({
            "name": tags.get("name") or tags.get("operator") or "OpenStreetMap charging site",
            "address": ", ".join([x for x in [
                tags.get("addr:housename"), tags.get("addr:street"), tags.get("addr:city"), tags.get("addr:postcode")
            ] if x]) or "Address not provided",
            "lat": float(lat),
            "lon": float(lon),
            "operator": tags.get("operator") or tags.get("network") or "Operator not provided",
            "status": tags.get("operational_status") or tags.get("status") or "Status unknown",
            "units": parse_qty(tags.get("capacity")) or None,
            "source": "OpenStreetMap / Overpass",
            "confidence": "OSM mapped data",
            "connectors": parse_osm_connectors(tags),
        })
    return rows


# ---------------------------------------------------------------------------
# TII traffic counter / AADT provider
# ---------------------------------------------------------------------------
# The visual TII map at https://trafficdata.tii.ie/publicmultinodemap.asp is the
# public-facing reference. For the local app engine we use the official TII open
# data files behind that ecosystem: counter locations plus daily aggregated
# counter counts. This avoids screen-scraping the interactive map.

TII_COUNTER_LOCATION_URLS = [
    # Official TII counter locations. GeoJSON is preferred. DAT/ZIP/KML are added as fallbacks
    # because some local networks block one format but allow another.
    "https://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.geojson",
    "http://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.geojson",
    "https://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.dat",
    "http://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.dat",
    "https://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.kml",
    "http://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.kml",
    "https://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.zip",
    "http://data.tii.ie/Datasets/TrafficCounters/tmu-traffic-counters.zip",
    # Fallback via the resource URL advertised by data.gov.ie.
    "https://data.gov.ie/dataset/traffic-counter-locations/resource/69d0c65c-a7da-468a-8eed-790e9ccf7001/download/tmu-traffic-counters.geojson",
]
# TII public website report resources. These are exposed from the same TII
# ecosystem as https://trafficdata.tii.ie/publicmultinodemap.asp and are more
# likely to be reachable when data.tii.ie is blocked by local DNS/firewall rules.
TII_PUBLIC_AADT_SUMMARY_URLS = [
    # User-selected TII AADT Summary Report. This is treated as the first-choice
    # automatic AADT list because it already contains the published AADT values.
    "https://trafficdata.tii.ie/dsaadtsummary.asp?sgid=xzoa8m4lr27p0hao3_srsb&reportdate=2019-01-01&enddate=2026-12-31",
    # Fallback historical windows published through the same TII reporting system.
    "https://trafficdata.tii.ie/dsaadtsummary.asp?sgid=xzoa8m4lr27p0hao3_srsb&reportdate=2013-01-01&enddate=2024-12-31",
    "https://trafficdata.tii.ie/dsaadtsummary.asp?sgid=xzoa8m4lr27p0hao3_srsb&reportdate=2013-01-01&enddate=2023-12-31",
    "https://trafficdata.tii.ie/dsaadtsummary.asp?sgid=xzoa8m4lr27p0hao3_srsb&reportdate=2013-01-01&enddate=2020-12-31",
]
TII_DAILY_AGGR_URL = "https://data.tii.ie/Datasets/TrafficCountData/{yyyy}/{mm}/{dd}/per-site-class-aggr-{yyyy}-{mm}-{dd}.csv"
TII_COUNTER_CACHE = {"loaded": False, "counters": [], "error": None}
TII_DAILY_CSV_CACHE = {}
TII_AADT_SUMMARY_CACHE = {"loaded": False, "counters": [], "error": None}


# Local AADT database generated from the uploaded TII AADT Summary Excel.
# It contains Site ID, Site Name, Description and yearly AADT values, but no GPS.
# Therefore this provider uses careful name/description matching and clearly labels
# the result as a text-based TII lookup rather than a nearest-coordinate lookup.
TII_LOCAL_AADT_JSON = ROOT / "data" / "tii_aadt_summary_2019_2026.json"
TII_LOCAL_AADT_CACHE = {"loaded": False, "records": [], "error": None}
TII_LOCATION_ENRICHMENT_CACHE = {"attempted": False, "error": None, "matched": 0, "source": None}

AADT_MATCH_STOPWORDS = {
    # General words that should not drive a traffic-counter match on their own.
    # City/region names such as Cork and Dublin are intentionally NOT stopwords;
    # they are weak context tags that become useful when combined with a stronger
    # tag such as airport, tunnel, interchange, mahon, douglas, etc.
    "ireland", "irish", "county", "co",
    "road", "street", "drive", "avenue", "lane", "park", "business", "retail", "industrial", "estate",
    "shopping", "centre", "center", "sc", "unit", "units", "site", "the", "and", "between", "near",
    "lower", "upper", "north", "south", "east", "west", "eircode", "town", "city", "village",
    "limited", "ltd", "plc", "ire", "restaurant", "shop", "store", "car", "parking", "charger"
}

AADT_REGION_TOKENS = {"cork", "dublin", "galway", "limerick", "waterford", "wicklow", "kildare", "meath", "louth"}

# Multi-tag aliases improve cases where the searched site name is not written in
# the same way as the TII counter description. They do not replace the lookup;
# they add tags that help score the relevant corridor records.
AADT_ADDRESS_ALIAS_RULES = [
    ({"dublin", "airport"}, ["dublinairport", "airport", "dublin", "swords", "M01", "N01"]),
    ({"cork", "airport"}, ["corkairport", "airport", "cork", "ballycurreen", "N27"]),
    ({"eastgate"}, ["little", "island", "littleisland", "N25"]),
    ({"little", "island"}, ["littleisland", "N25", "carrigtwohill", "carigtohill"]),
    ({"mahon"}, ["mahon", "N40", "N25", "jack", "lynch", "tunnel"]),
    ({"douglas"}, ["douglas", "N40", "south", "ring"]),
    ({"ballincollig"}, ["ballincollig", "curraheen", "bishopstown", "N40"]),
    ({"galway"}, ["galway", "bothar", "treabh", "N06", "N84", "N83"]),
]

# Mission-critical search pipeline rules. These are not intended to replace
# official geocoding; they ensure broad city/town searches produce a credible
# nearest traffic proxy instead of falling through to a generic fallback. Site IDs
# refer to the uploaded TII AADT Summary database included with the app.
AADT_PRIORITY_COUNTER_RULES = [
    ({"galway"}, "000000001069", "city anchor: N06 Between N84 and N83, Bothar na dTreabh, Co Galway"),
    ({"dublin", "airport"}, "000000001011", "airport anchor: M01 Airport Link Road / Dublin Airport"),
    ({"cork", "airport"}, "000000001271", "airport anchor: N27 Cork Airport corridor"),
    ({"little", "island"}, "000000020258", "place anchor: N25/N28 Little Island interchange corridor"),
    ({"eastgate"}, "000000020258", "place anchor: N25/N28 Little Island / Eastgate corridor"),
    ({"mahon"}, "000000001256", "place anchor: N40 Jack Lynch Tunnel / Mahon corridor"),
    ({"ballincollig"}, "000000001228", "place anchor: N22 Ballincollig Bypass corridor"),
]

# Coordinates attached locally to important traffic counters. The uploaded AADT
# Excel has values but not always WGS84 coordinates, and online TII enrichment may
# be unavailable in a demo environment. These point-level proxies let the app
# choose a nearest counter consistently and disclose the source/confidence.
AADT_COUNTER_COORD_OVERRIDES = {
    "000000001069": {"lat": 53.2933, "lon": -9.0159, "location_source": "built-in traffic counter coordinate proxy: Bothar na dTreabh, Galway"},
    "000000001011": {"lat": 53.4253, "lon": -6.2454, "location_source": "built-in traffic counter coordinate proxy: Dublin Airport Link"},
    "000000001271": {"lat": 51.8479, "lon": -8.4860, "location_source": "built-in traffic counter coordinate proxy: Cork Airport N27"},
    "000000020258": {"lat": 51.9057, "lon": -8.3663, "location_source": "built-in traffic counter coordinate proxy: Little Island N25/N28 interchange"},
    "000000001256": {"lat": 51.8826, "lon": -8.3905, "location_source": "built-in traffic counter coordinate proxy: Mahon / N40"},
    "000000001228": {"lat": 51.8879, "lon": -8.5920, "location_source": "built-in traffic counter coordinate proxy: Ballincollig Bypass / N22"},
}


def _aadt_normalise_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _aadt_compact(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _aadt_tokens(value: str) -> list[str]:
    norm = _aadt_normalise_text(value)
    raw = norm.split()
    tokens = []
    for tok in raw:
        if len(tok) < 4:
            continue
        if tok in AADT_MATCH_STOPWORDS:
            continue
        if re.fullmatch(r"[a-z]\d+", tok):
            continue
        if re.fullmatch(r"\d+", tok):
            continue
        # Eircodes are excellent for geocoding, but TII rows do not contain them.
        if re.fullmatch(r"[a-z]\d{2}[a-z0-9]{4}", tok):
            continue
        tokens.append(tok)
    # keep order but unique
    out = []
    for tok in tokens:
        if tok not in out:
            out.append(tok)
    return out


def _aadt_phrases(tokens: list[str]) -> list[str]:
    phrases = []
    for n in (3, 2):
        for i in range(0, max(0, len(tokens) - n + 1)):
            phrase = "".join(tokens[i:i+n])
            if len(phrase) >= 8 and phrase not in phrases:
                phrases.append(phrase)
    return phrases


def _aadt_route_codes(value: str) -> list[str]:
    routes = []
    for m in re.finditer(r"\b([MN])\s*0*(\d{1,3})\b", (value or "").upper()):
        route = f"{m.group(1)}{int(m.group(2)):02d}" if int(m.group(2)) < 10 else f"{m.group(1)}{int(m.group(2))}"
        if route not in routes:
            routes.append(route)
    return routes


def _aadt_expand_address_for_matching(address: str) -> str:
    """Add matching tags derived from the searched address.

    TII descriptions often use corridor language rather than the commercial site
    name. For example, an address may say Eastgate while TII says Littleisland,
    or Dublin Airport may be represented by M01/N01 counter descriptions.
    """
    norm_tokens = set(_aadt_normalise_text(address).split())
    compact = _aadt_compact(address)
    extras = []
    for required, tags in AADT_ADDRESS_ALIAS_RULES:
        # All required tags must be present. This prevents "Dublin Airport" from
        # accidentally triggering the Cork Airport alias simply because the word
        # "airport" appears.
        matched = required.issubset(norm_tokens) or all(term in compact for term in required)
        if matched:
            extras.extend(tags)
    return f"{address or ''} {' '.join(extras)}".strip()


def load_local_tii_aadt_records() -> list[dict]:
    if TII_LOCAL_AADT_CACHE["loaded"]:
        return TII_LOCAL_AADT_CACHE["records"]
    try:
        raw = json.loads(TII_LOCAL_AADT_JSON.read_text(encoding="utf-8"))
        records = raw.get("records", [])
        for rec in records:
            text = f"{rec.get('site_name','')} {rec.get('description','')}"
            rec["_norm"] = _aadt_normalise_text(text)
            rec["_tokens"] = set(rec["_norm"].split())
            rec["_compact"] = _aadt_compact(text)
            sid = normalise_cosit(rec.get("site_id")) or str(rec.get("site_id", ""))
            if sid in AADT_COUNTER_COORD_OVERRIDES:
                rec.update(AADT_COUNTER_COORD_OVERRIDES[sid])
        # Best-effort enrichment: attach WGS84 coordinates from the official TII
        # traffic counter location file when that source is reachable. The app
        # still works with text matching if the online location file is blocked.
        try:
            _try_enrich_local_aadt_records_with_tii_locations(records)
        except Exception as enrich_exc:
            TII_LOCATION_ENRICHMENT_CACHE.update({"attempted": True, "error": str(enrich_exc), "matched": 0, "source": None})
        TII_LOCAL_AADT_CACHE.update({"loaded": True, "records": records, "error": None})
        return records
    except Exception as exc:
        TII_LOCAL_AADT_CACHE.update({"loaded": True, "records": [], "error": str(exc)})
        return []


def _try_enrich_local_aadt_records_with_tii_locations(records: list[dict]) -> None:
    if TII_LOCATION_ENRICHMENT_CACHE.get("attempted"):
        return
    counters, by_cosit = _counter_location_index()
    matched = 0
    for rec in records:
        sid = normalise_cosit(rec.get("site_id"))
        loc = by_cosit.get(sid) if sid else None
        if not loc:
            # Some TII exports may use a shortened identifier. Try suffix matching.
            for counter in counters:
                c = counter.get("cosit") or ""
                if sid and (c.endswith(sid[-6:]) or sid.endswith(c[-6:])):
                    loc = counter
                    break
        if not loc:
            # Last resort: use route + name similarity. This is only used to attach
            # coordinates; the selected AADT value still comes from the uploaded Excel.
            rec_text = f"{rec.get('site_name','')} {rec.get('description','')} {rec.get('route','')}"
            best = None
            for counter in counters:
                score = _name_similarity(rec_text, f"{counter.get('name','')} {counter.get('route','')}")
                if score >= 0.72 and (best is None or score > best[0]):
                    best = (score, counter)
            if best:
                loc = best[1]
        if loc:
            rec["lat"] = loc.get("lat")
            rec["lon"] = loc.get("lon")
            rec["location_source"] = loc.get("location_source") or "TII traffic counter location file"
            matched += 1
    TII_LOCATION_ENRICHMENT_CACHE.update({
        "attempted": True,
        "error": None,
        "matched": matched,
        "source": "TII traffic counter location file",
    })


def _record_has_coord(rec: dict) -> bool:
    try:
        lat = float(rec.get("lat"))
        lon = float(rec.get("lon"))
        return 49.0 <= lat <= 56.5 and -11.5 <= lon <= -5.0
    except Exception:
        return False


def _site_from_traffic_candidates(address: str, traffic: dict):
    coords = []
    for c in traffic.get("candidates") or []:
        try:
            lat = float(c.get("lat"))
            lon = float(c.get("lon"))
            if 49.0 <= lat <= 56.5 and -11.5 <= lon <= -5.0:
                coords.append((lat, lon))
        except Exception:
            pass
    if not coords:
        return None
    return {
        "name": address or "TII AADT matched location",
        "lat": sum(x[0] for x in coords) / len(coords),
        "lon": sum(x[1] for x in coords) / len(coords),
        "source": "Approximate location from matched TII counter coordinates",
        "confidence": "traffic-counter-proxy",
        "match_type": "AADT counter coordinate fallback",
    }


def _score_local_aadt_record(rec: dict, address: str) -> tuple[float, list[str], bool]:
    expanded_address = _aadt_expand_address_for_matching(address)
    tokens = _aadt_tokens(expanded_address)
    phrases = _aadt_phrases(tokens)
    routes = _aadt_route_codes(expanded_address)
    text_tokens = rec.get("_tokens") or set()
    compact = rec.get("_compact", "")
    score = 0.0
    matched = []
    has_strong = False

    rec_route = (rec.get("route") or "").upper().replace(" ", "")
    for route in routes:
        if route and (route == rec_route or route in compact):
            score += 12
            matched.append(route)
            has_strong = True

    for phrase in phrases:
        if phrase in compact:
            score += 7
            matched.append(phrase)
            has_strong = True

    non_region_token_hits = 0
    for tok in tokens:
        if tok in text_tokens:
            if tok in AADT_REGION_TOKENS:
                score += 1.25
            else:
                score += 3
                non_region_token_hits += 1
            matched.append(tok)
        elif len(tok) >= 8 and tok in compact:
            score += 1.5
            if tok not in AADT_REGION_TOKENS:
                non_region_token_hits += 1
            matched.append(tok)

    if non_region_token_hits >= 2:
        score += 2
        has_strong = True
    elif non_region_token_hits >= 1 and any(tok in AADT_REGION_TOKENS for tok in matched):
        score += 1
        has_strong = True

    # Broad city-only matches are weak, but valid as a fallback because the app
    # must return the best available traffic proxy for city/town searches such as
    # "Galway" rather than dropping to a generic AADT estimate.
    if matched and all(tok in AADT_REGION_TOKENS for tok in matched):
        score = max(score, 3.0)
        has_strong = False

    return score, matched, has_strong


def _record_to_aadt_result(rec: dict, source: str, confidence: str, method_note: str, *, distance_km=None, match_basis="priority/nearest fallback", matched_terms=None, limit_candidates=None) -> dict:
    candidate = {
        "selected": True,
        "counter_id": rec.get("site_id"),
        "counter_name": rec.get("site_name"),
        "description": rec.get("description"),
        "route": rec.get("route") or "route not provided",
        "aadt": rec.get("latest_aadt"),
        "aadt_year": rec.get("latest_year"),
        "valid_days": f"TII Excel {rec.get('latest_year')}",
        "match_basis": match_basis,
        "matched_terms": matched_terms or [],
    }
    if distance_km is not None:
        candidate["distance_km"] = round(distance_km, 2)
    if _record_has_coord(rec):
        candidate.update({"lat": rec.get("lat"), "lon": rec.get("lon"), "location_source": rec.get("location_source")})
    candidates = [candidate]
    if limit_candidates:
        candidates.extend(limit_candidates)
    return {
        "aadt": int(round(float(rec.get("latest_aadt") or 0))),
        "source": source,
        "confidence": confidence,
        "provider": "Uploaded TII AADT Summary Excel database",
        "counter_id": rec.get("site_id"),
        "counter_name": rec.get("site_name"),
        "route": rec.get("route") or "route not provided",
        "counter_distance_km": round(distance_km, 2) if distance_km is not None else None,
        "aadt_year": rec.get("latest_year"),
        "sample_days": "published annual AADT values from uploaded Excel",
        "sample_mode": match_basis,
        "candidates": candidates,
        "reference": "AADT Summary Report Public sites 04-2025 2019 to 2026 (1).xlsx",
        "method_note": method_note,
    }


def tii_aadt_priority_counter_lookup(address: str, site: dict | None = None) -> dict:
    records = load_local_tii_aadt_records()
    if not records:
        raise RuntimeError(TII_LOCAL_AADT_CACHE.get("error") or "Local TII AADT Excel lookup database did not load")
    norm = set(_aadt_normalise_text(address).split())
    compact = _aadt_compact(address)
    by_id = {(normalise_cosit(r.get("site_id")) or str(r.get("site_id", ""))): r for r in records}
    for required, site_id, reason in AADT_PRIORITY_COUNTER_RULES:
        matched = required.issubset(norm) or all(term in compact for term in required)
        if not matched:
            continue
        rec = by_id.get(normalise_cosit(site_id) or site_id)
        if not rec or not rec.get("latest_aadt"):
            continue
        distance = None
        if site and _record_has_coord(rec):
            try:
                distance = haversine_km(float(site["lat"]), float(site["lon"]), float(rec["lat"]), float(rec["lon"]))
            except Exception:
                distance = None
        return _record_to_aadt_result(
            rec,
            source=f"Uploaded TII AADT Summary Excel · priority place/city counter · {rec.get('site_name')} · {rec.get('latest_year')}",
            confidence="medium-high / priority nearest place traffic counter",
            method_note=f"The searched location matched a built-in Irish place/city traffic rule ({reason}). This is used when exact address/TII coordinate matching is unavailable or ambiguous. Validate against the TII map for investment-grade diligence.",
            distance_km=distance,
            match_basis="priority place/city traffic counter",
            matched_terms=sorted(required),
        )
    raise RuntimeError("No priority AADT counter rule matched this address")


def tii_aadt_from_local_excel_name_lookup(address: str, limit: int = 12) -> dict:
    records = load_local_tii_aadt_records()
    if not records:
        raise RuntimeError(TII_LOCAL_AADT_CACHE.get("error") or "Local TII AADT Excel lookup database did not load")

    scored = []
    for rec in records:
        aadt = rec.get("latest_aadt")
        if not isinstance(aadt, (int, float)) or aadt <= 0:
            continue
        score, matched_terms, has_strong = _score_local_aadt_record(rec, address)
        # Accept exact strong phrase/route matches, specific single-place token
        # matches, and weak city-token matches as a last-resort fallback. Priority
        # counter rules handle the most important broad city cases first.
        if score >= 3:
            scored.append((score, rec, matched_terms, has_strong))

    if not scored:
        raise RuntimeError("No matching Site Name or Description rows found in the uploaded TII AADT Summary Excel")

    scored.sort(key=lambda x: (-x[0], -(x[1].get("latest_year") or 0), str(x[1].get("site_id", ""))))
    top_score = scored[0][0]
    # Use all relevant rows that match the address meaningfully. Keep weak single-token results only if they are close to the best score.
    matches = [x for x in scored if x[0] >= max(3, top_score - 2)]
    if len(matches) < 2:
        matches = scored[:1]
    if len(matches) > limit:
        matches = matches[:limit]

    aadts = [float(x[1]["latest_aadt"]) for x in matches]
    avg_aadt = int(round(sum(aadts) / len(aadts)))
    years = sorted({str(x[1].get("latest_year")) for x in matches if x[1].get("latest_year")})
    route_labels = sorted({x[1].get("route") for x in matches if x[1].get("route")})
    confidence = "high / TII Excel text match" if len(matches) == 1 and matches[0][0] >= 7 else "medium / TII Excel averaged text match"
    if len(matches) > 5:
        confidence = "medium-low / broad TII Excel text match"

    candidates = []
    for i, (score, rec, matched_terms, has_strong) in enumerate(matches):
        candidate = {
            "selected": i == 0,
            "counter_id": rec.get("site_id"),
            "counter_name": rec.get("site_name"),
            "description": rec.get("description"),
            "route": rec.get("route") or "route not provided",
            "aadt": rec.get("latest_aadt"),
            "aadt_year": rec.get("latest_year"),
            "valid_days": f"TII Excel {rec.get('latest_year')}",
            "match_score": round(score, 2),
            "matched_terms": matched_terms,
            "match_basis": "name/description text match",
        }
        if _record_has_coord(rec):
            candidate.update({
                "lat": rec.get("lat"),
                "lon": rec.get("lon"),
                "location_source": rec.get("location_source"),
            })
        candidates.append(candidate)

    return {
        "aadt": avg_aadt,
        "source": f"Uploaded TII AADT Summary Excel · name/description lookup · {len(matches)} matched row{'s' if len(matches) != 1 else ''} averaged",
        "confidence": confidence,
        "provider": "Uploaded TII AADT Summary Excel database",
        "counter_id": ", ".join(str(x[1].get("site_id")) for x in matches[:3]) + ("…" if len(matches) > 3 else ""),
        "counter_name": "; ".join(str(x[1].get("site_name")) for x in matches[:3]) + ("…" if len(matches) > 3 else ""),
        "route": ", ".join(route_labels) if route_labels else "route not provided",
        "aadt_year": ", ".join(years) if years else "latest available",
        "sample_days": "published annual AADT values from uploaded Excel",
        "sample_mode": "TII Excel name/description lookup",
        "candidates": candidates,
        "reference": "AADT Summary Report Public sites 04-2025 2019 to 2026 (1).xlsx",
        "method_note": "The app matched the searched address text against Site Name and Description in the uploaded TII AADT Summary Excel. Where several relevant TII rows matched, their latest available AADT values were averaged. If TII counter coordinates were available, they are attached to the matched rows; otherwise this remains a text-based corridor proxy. Use manual override if you know the correct counter.",
    }


def tii_aadt_from_local_excel_nearest_coordinate(site: dict, address: str, limit: int = 8, max_km: float = 80.0) -> dict:
    records = load_local_tii_aadt_records()
    if not records:
        raise RuntimeError(TII_LOCAL_AADT_CACHE.get("error") or "Local TII AADT Excel lookup database did not load")
    if not any(_record_has_coord(r) for r in records):
        enrich_error = TII_LOCATION_ENRICHMENT_CACHE.get("error")
        raise RuntimeError(f"Uploaded TII AADT Excel has not been coordinate-enriched yet{': ' + enrich_error if enrich_error else ''}")
    ranked = []
    for rec in records:
        if not _record_has_coord(rec):
            continue
        aadt = rec.get("latest_aadt")
        if not isinstance(aadt, (int, float)) or aadt <= 0:
            continue
        d = haversine_km(float(site["lat"]), float(site["lon"]), float(rec["lat"]), float(rec["lon"]))
        if d > max_km:
            continue
        text_score, matched_terms, has_strong = _score_local_aadt_record(rec, address)
        route_score = route_hint_score(address, {"route": rec.get("route"), "name": rec.get("site_name")})
        # Prefer a close counter, but allow route/address text to help when two corridors are nearby.
        selection_score = (route_score * 1.5) + (text_score * 2.0) - min(60, d * 2.0)
        ranked.append((selection_score, d, text_score, route_score, rec, matched_terms))
    if not ranked:
        raise RuntimeError("No coordinate-enriched TII AADT Excel counters were close enough to the searched site")
    ranked.sort(key=lambda x: (-x[0], x[1]))
    selected = ranked[0]
    rec = selected[4]
    candidates = []
    for i, (score, d, text_score, route_score, r, terms) in enumerate(ranked[:limit]):
        candidates.append({
            "selected": i == 0,
            "counter_id": r.get("site_id"),
            "counter_name": r.get("site_name"),
            "description": r.get("description"),
            "route": r.get("route") or "route not provided",
            "aadt": r.get("latest_aadt"),
            "aadt_year": r.get("latest_year"),
            "valid_days": f"TII Excel {r.get('latest_year')}",
            "distance_km": round(d, 2),
            "match_score": round(text_score, 2),
            "route_score": round(route_score, 2),
            "selection_score": round(score, 2),
            "matched_terms": terms,
            "lat": r.get("lat"),
            "lon": r.get("lon"),
            "location_source": r.get("location_source"),
            "match_basis": "nearest coordinate-enriched TII counter with address/route scoring",
        })
    confidence = "high / nearest TII Excel counter with official coordinates" if selected[1] <= 5 else "medium / nearest TII Excel counter with official coordinates"
    if selected[1] > 25:
        confidence = "medium-low / distant nearest TII counter"
    return {
        "aadt": int(round(float(rec.get("latest_aadt")))),
        "source": f"Uploaded TII AADT Summary Excel · nearest coordinate-enriched counter · {rec.get('site_name')} · {rec.get('latest_year')}",
        "confidence": confidence,
        "provider": "Uploaded TII AADT Excel joined to TII counter locations",
        "counter_id": rec.get("site_id"),
        "counter_name": rec.get("site_name"),
        "route": rec.get("route") or "route not provided",
        "counter_distance_km": round(selected[1], 2),
        "aadt_year": rec.get("latest_year"),
        "sample_days": "published annual AADT value from uploaded Excel",
        "sample_mode": "TII Excel nearest coordinate-enriched lookup",
        "candidates": candidates,
        "reference": "AADT Summary Report Public sites 04-2025 2019 to 2026 (1).xlsx + TII traffic counter location file",
        "method_note": "The uploaded TII AADT Excel provides the annual AADT values. The app attempts to attach official TII counter coordinates by Site ID, then selects the nearest counter to the searched address. Address/route text is used as a tie-breaker. Treat as a corridor AADT proxy where the charging site is not directly on the countered road.",
        "location_enrichment": dict(TII_LOCATION_ENRICHMENT_CACHE),
    }


def http_bytes(url: str, timeout: float = 8.0) -> bytes:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json,text/plain,*/*",
        "Accept-Language": "en",
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def http_text(url: str, timeout: float = 8.0) -> str:
    return http_bytes(url, timeout=timeout).decode("utf-8", errors="replace")


def first_prop(props: dict, names, default=None):
    for name in names:
        if name in props and props[name] not in (None, ""):
            return props[name]
        # case-insensitive fallback
        for key, value in props.items():
            if key.lower() == name.lower() and value not in (None, ""):
                return value
    return default


def normalise_cosit(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip().strip('"')
    if not s:
        return None
    # Values in TII daily CSVs are zero-padded, for example 000000001015.
    digits = "".join(ch for ch in s if ch.isdigit())
    if not digits:
        return s
    return digits.zfill(12)


def _norm_header(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _to_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", "")
    if not s or s.lower() in {"-", "n/a", "na", "null"}:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except Exception:
        return None


def _xlsx_shared_strings(zf):
    try:
        xml = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(xml)
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    strings = []
    for si in root.findall("a:si", ns):
        parts = []
        for t in si.findall(".//a:t", ns):
            parts.append(t.text or "")
        strings.append("".join(parts))
    return strings


def _cell_value(cell, shared):
    t = cell.attrib.get("t")
    v = cell.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
    if v is None:
        inline = cell.find(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
        return inline.text if inline is not None else ""
    raw = v.text or ""
    if t == "s":
        try:
            return shared[int(raw)]
        except Exception:
            return raw
    return raw


def _xlsx_rows(raw: bytes) -> list[list[str]]:
    rows = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        shared = _xlsx_shared_strings(zf)
        sheet_names = [n for n in zf.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
        for name in sheet_names[:3]:
            root = ET.fromstring(zf.read(name))
            ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
            for row in root.findall(f".//{ns}sheetData/{ns}row"):
                values = []
                last_col = 0
                for c in row.findall(f"{ns}c"):
                    ref = c.attrib.get("r", "A1")
                    col_letters = re.sub(r"[^A-Z]", "", ref.upper())
                    col_idx = 0
                    for ch in col_letters:
                        col_idx = col_idx * 26 + (ord(ch) - 64)
                    while last_col + 1 < col_idx:
                        values.append("")
                        last_col += 1
                    values.append(str(_cell_value(c, shared)))
                    last_col = col_idx
                if any(str(x).strip() for x in values):
                    rows.append(values)
    return rows


def _csv_or_tsv_rows(text: str) -> list[list[str]]:
    sample = text[:4096]
    dialect = csv.excel_tab if sample.count("\t") > sample.count(",") else csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect=dialect) if any(str(x).strip() for x in row)]


def _table_like_rows_from_response(raw: bytes, content_hint: str = "") -> list[list[str]]:
    # Supports TII XLSX, CSV/TSV and simple HTML table exports.
    if raw[:2] == b"PK":
        return _xlsx_rows(raw)
    text = raw.decode("utf-8", errors="replace")
    if "<table" in text.lower():
        trs = re.findall(r"<tr[^>]*>(.*?)</tr>", text, flags=re.I | re.S)
        rows = []
        for tr in trs:
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.I | re.S)
            clean = [re.sub(r"<[^>]+>", "", c).replace("&nbsp;", " ").strip() for c in cells]
            if any(clean):
                rows.append(clean)
        if rows:
            return rows
    return _csv_or_tsv_rows(text)


def _find_header_and_records(rows: list[list[str]]):
    # Pick the row that looks most like a header row for a TII site summary.
    best = None
    best_score = -1
    for i, row in enumerate(rows[:80]):
        joined = " ".join(str(x).lower() for x in row)
        score = sum(term in joined for term in ["cosit", "site", "name", "description", "latitude", "longitude", "aadt", "route", "road"] )
        if score > best_score:
            best = i
            best_score = score
    if best is None or best_score <= 0:
        return [], []
    headers = [str(x).strip() for x in rows[best]]
    records = []
    for row in rows[best + 1:]:
        if len(row) < len(headers):
            row = row + [""] * (len(headers) - len(row))
        rec = {headers[j]: row[j] for j in range(min(len(headers), len(row)))}
        if any(str(v).strip() for v in rec.values()):
            records.append(rec)
    return headers, records


def _pick_by_headers(record: dict, candidates: list[str]):
    norm_map = {_norm_header(k): v for k, v in record.items()}
    for c in candidates:
        nc = _norm_header(c)
        if nc in norm_map and str(norm_map[nc]).strip():
            return norm_map[nc]
    for k, v in norm_map.items():
        if any(_norm_header(c) in k for c in candidates) and str(v).strip():
            return v
    return None


def _coord_from_summary_record(record: dict):
    """Extract WGS84 latitude/longitude from a TII AADT summary row.

    The TII ASP report has appeared with slightly different column names across
    downloads. This parser accepts the common WGS84 names, generic X/Y where
    those values are already longitude/latitude, and swapped lat/lon columns.
    It deliberately rejects Irish Grid / ITM easting-northing values because a
    silent projection mistake would select the wrong counter.
    """
    lat_candidates = [
        "latitude", "lat", "wgs84lat", "wgs84 latitude", "site latitude",
        "node latitude", "y", "ycoord", "y coordinate", "gps latitude"
    ]
    lon_candidates = [
        "longitude", "lon", "lng", "long", "wgs84lon", "wgs84 longitude",
        "site longitude", "node longitude", "x", "xcoord", "x coordinate",
        "gps longitude"
    ]
    lat = _to_number(_pick_by_headers(record, lat_candidates))
    lon = _to_number(_pick_by_headers(record, lon_candidates))
    if lat is not None and lon is not None:
        # Normal Irish WGS84.
        if 49 <= lat <= 56 and -12 <= lon <= -4:
            return lat, lon
        # Sometimes X/Y are exposed as lon/lat.
        if 49 <= lon <= 56 and -12 <= lat <= -4:
            return lon, lat
    return None, None


def _extract_year_aadt(record: dict):
    best = None
    best_year = -1
    for key, value in record.items():
        n = _norm_header(key)
        val = _to_number(value)
        if val is None or val <= 0:
            continue
        m = re.search(r"(20\d{2}|19\d{2})", str(key))
        if "aadt" in n or (m and 1900 <= int(m.group(1)) <= 2100):
            year = int(m.group(1)) if m else 0
            if year >= best_year:
                best_year = year
                best = val
    if best is not None:
        return round(best), best_year if best_year > 0 else None
    return None, None



def _location_counter_from_parts(cosit, name, route, lat, lon, properties=None, source="TII traffic counter location file"):
    cosit = normalise_cosit(cosit)
    if not cosit:
        return None
    try:
        lat = float(lat); lon = float(lon)
    except Exception:
        return None
    if not (49.0 <= lat <= 56.5 and -11.5 <= lon <= -5.0):
        return None
    return {
        "cosit": cosit,
        "name": str(name or cosit),
        "route": str(route or ""),
        "lat": lat,
        "lon": lon,
        "properties": properties or {},
        "location_source": source,
    }


def _parse_tii_location_geojson(data, source_label):
    counters = []
    for feature in data.get("features", []):
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if geom.get("type") == "Point" and len(coords) >= 2:
            lon, lat = coords[0], coords[1]
        else:
            continue
        props = feature.get("properties") or {}
        cosit = first_prop(props, [
            "cosit", "CoSit", "COSIT", "site", "site_id", "SiteID",
            "id", "ID", "siteid", "Site Id", "TMU", "TMU_ID", "tmuid"
        ]) or " ".join(str(v) for v in props.values())
        name = first_prop(props, ["description", "Description", "name", "Name", "SiteName", "site_name", "Location", "location"], cosit)
        route = first_prop(props, ["route", "Route", "road", "Road", "road_number", "RoadNumber", "RoadName", "roadName", "RouteName"], "")
        item = _location_counter_from_parts(cosit, name, route, lat, lon, props, source_label)
        if item:
            counters.append(item)
    return counters


def _parse_tii_location_delimited(text, source_label):
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters="\t,;|")
    except Exception:
        dialect = csv.excel_tab if "\t" in sample else csv.excel
    rows = list(csv.DictReader(io.StringIO(text), dialect=dialect))
    counters = []
    for row in rows:
        norm = {_norm_header(k): v for k, v in row.items()}
        def get(names):
            for n in names:
                v = norm.get(_norm_header(n))
                if v not in (None, ""):
                    return v
            return None
        lat = get(["lat", "latitude", "wgs84latitude", "y", "ycoord", "gpslatitude"])
        lon = get(["lon", "lng", "long", "longitude", "wgs84longitude", "x", "xcoord", "gpslongitude"])
        # Some DAT exports use X/Y but could be WGS84; only accept if the values look like Ireland lat/lon.
        cosit = get(["cosit", "siteid", "site id", "id", "tmuid", "tmu id", "site"])
        name = get(["description", "name", "sitename", "site name", "location"])
        route = get(["route", "road", "roadnumber", "road number", "roadname", "road name"])
        item = _location_counter_from_parts(cosit, name, route, lat, lon, row, source_label)
        if item:
            counters.append(item)
    return counters


def _parse_tii_location_kml(text, source_label):
    counters = []
    try:
        root = ET.fromstring(text.encode("utf-8"))
    except Exception:
        return counters
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    placemarks = root.findall(".//kml:Placemark", ns) or root.findall(".//Placemark")
    for pm in placemarks:
        def findtext(path):
            el = pm.find(path, ns) if "kml:" in path else pm.find(path)
            return el.text.strip() if el is not None and el.text else ""
        name = findtext("kml:name") or findtext("name")
        desc = findtext("kml:description") or findtext("description")
        coord_text = findtext(".//kml:coordinates") or findtext(".//coordinates")
        if not coord_text:
            continue
        parts = coord_text.strip().split()[0].split(",")
        if len(parts) < 2:
            continue
        lon, lat = parts[0], parts[1]
        cosit = normalise_cosit(name) or normalise_cosit(desc)
        route_match = re.search(r"\b[MN]\s*0*\d{1,3}\b", f"{name} {desc}", re.I)
        route = route_match.group(0).upper().replace(" ", "") if route_match else ""
        item = _location_counter_from_parts(cosit, name or desc, route, lat, lon, {"description": desc}, source_label)
        if item:
            counters.append(item)
    return counters


def _load_tii_counter_locations_from_geojson():
    """Load official TII counter locations from any reachable published format.

    The preferred source is the official GeoJSON, but this parser also supports
    DAT/TSV/CSV/KML/ZIP fallbacks from the same TII directory. This makes the local
    demo more resilient to network policies that block one file type.
    """
    errors = []
    for url in TII_COUNTER_LOCATION_URLS:
        try:
            raw = http_bytes(url, timeout=12.0)
            payloads = []
            lower = url.lower()
            if lower.endswith(".zip") or raw[:2] == b"PK":
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    for name in zf.namelist():
                        lname = name.lower()
                        if lname.endswith((".geojson", ".json", ".dat", ".tsv", ".csv", ".kml")):
                            payloads.append((lname, zf.read(name)))
            else:
                payloads.append((lower, raw))
            counters = []
            for name, body in payloads:
                text = body.decode("utf-8-sig", errors="replace")
                if name.endswith((".geojson", ".json")) or text.lstrip().startswith("{"):
                    counters.extend(_parse_tii_location_geojson(json.loads(text), url))
                elif name.endswith(".kml") or "<kml" in text[:500].lower():
                    counters.extend(_parse_tii_location_kml(text, url))
                else:
                    counters.extend(_parse_tii_location_delimited(text, url))
            # De-duplicate by cosit.
            dedup = {}
            for c in counters:
                dedup.setdefault(c["cosit"], c)
            counters = list(dedup.values())
            if counters:
                return counters
            errors.append(f"{url}: loaded but no WGS84 point counters were parsed")
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    raise RuntimeError("; ".join(errors) or "TII counter location files could not be loaded")


def _counter_location_index():
    counters = _load_tii_counter_locations_from_geojson()
    by_cosit = {c["cosit"]: c for c in counters if c.get("cosit")}
    return counters, by_cosit


def _extract_counter_id_from_summary_record(rec: dict, name: str = ""):
    # The public AADT report can expose the counter identifier using several
    # different labels. Try exact/semantic headers first, then scan the row text.
    value = _pick_by_headers(rec, [
        "cosit", "co-sit", "co sit", "site id", "siteid", "site", "counter id",
        "counterid", "node id", "nodeid", "tmuid", "tmu id", "tmu", "site number",
        "site no", "site no.", "site ref", "site reference", "id"
    ])
    cosit = normalise_cosit(value)
    if cosit:
        return cosit
    text = " ".join(str(x) for x in list(rec.keys()) + list(rec.values()) + [name])
    # Prefer 12 digit identifiers if present, but accept shorter TMU/COSIT IDs.
    for pat in [r"\b\d{12}\b", r"\b\d{8,11}\b", r"\b\d{4,7}\b"]:
        m = re.search(pat, text)
        if m:
            return normalise_cosit(m.group(0))
    return None


def _name_similarity(a: str, b: str) -> float:
    aw = {w for w in re.findall(r"[a-z0-9]+", (a or "").lower()) if len(w) >= 3}
    bw = {w for w in re.findall(r"[a-z0-9]+", (b or "").lower()) if len(w) >= 3}
    if not aw or not bw:
        return 0.0
    return len(aw & bw) / max(1, len(aw | bw))


def _attach_location_to_summary_row(row: dict, location_counters: list[dict], by_cosit: dict[str, dict]):
    lat = row.get("lat")
    lon = row.get("lon")
    if lat is not None and lon is not None:
        return row

    cosit = row.get("cosit")
    loc = by_cosit.get(cosit) if cosit else None

    # Sometimes a summary counter id omits leading zeros or uses a related site
    # reference. Try suffix matching before falling back to name/route matching.
    if not loc and cosit:
        for key, candidate in by_cosit.items():
            if key.endswith(cosit) or cosit.endswith(key):
                loc = candidate
                break

    if not loc:
        best = None
        row_name = f"{row.get('name','')} {row.get('route','')}"
        for candidate in location_counters:
            score = _name_similarity(row_name, f"{candidate.get('name','')} {candidate.get('route','')}")
            if score > 0 and (best is None or score > best[0]):
                best = (score, candidate)
        if best and best[0] >= 0.35:
            loc = best[1]

    if not loc:
        return row

    out = dict(row)
    out["lat"] = loc.get("lat")
    out["lon"] = loc.get("lon")
    out["name"] = out.get("name") or loc.get("name")
    out["route"] = out.get("route") or loc.get("route")
    out["location_source"] = "TII traffic counter location GeoJSON"
    out["location_properties"] = loc.get("properties", {})
    return out


def load_tii_public_aadt_summary_counters():
    if TII_AADT_SUMMARY_CACHE["loaded"]:
        return TII_AADT_SUMMARY_CACHE["counters"]
    errors = []
    location_counters = []
    by_cosit = {}
    location_error = None
    try:
        location_counters, by_cosit = _counter_location_index()
    except Exception as exc:
        location_error = str(exc)

    for url in TII_PUBLIC_AADT_SUMMARY_URLS:
        try:
            raw = http_bytes(url, timeout=20.0)
            rows = _table_like_rows_from_response(raw, url)
            headers, records = _find_header_and_records(rows)
            parsed = []
            no_aadt = 0
            no_id = 0
            for rec in records:
                lat, lon = _coord_from_summary_record(rec)
                name = _pick_by_headers(rec, [
                    "description", "site name", "sitename", "name", "location",
                    "site description", "counter name"
                ]) or "TII counter"
                route = _pick_by_headers(rec, [
                    "route", "road", "road number", "roadnumber", "road name",
                    "roadname", "route name"
                ]) or ""
                cosit = _extract_counter_id_from_summary_record(rec, str(name))
                if not cosit:
                    no_id += 1
                aadt, year = _extract_year_aadt(rec)
                if aadt is None or aadt <= 0:
                    no_aadt += 1
                    continue
                row = {
                    "cosit": cosit or normalise_cosit(str(name)) or str(len(parsed) + 1).zfill(12),
                    "name": str(name),
                    "route": str(route or ""),
                    "lat": lat,
                    "lon": lon,
                    "precomputed_aadt": int(round(aadt)),
                    "aadt_year": year,
                    "properties": rec,
                    "loaded_from": "TII public AADT summary report",
                    "from_public_summary": True,
                    "summary_url": url,
                }
                row = _attach_location_to_summary_row(row, location_counters, by_cosit)
                if row.get("lat") is not None and row.get("lon") is not None:
                    parsed.append(row)

            if parsed:
                TII_AADT_SUMMARY_CACHE.update({"loaded": True, "counters": parsed, "error": None})
                return parsed

            detail = f"{url}: parsed report but no rows could be joined to WGS84 counter locations"
            if location_error:
                detail += f"; location GeoJSON error: {location_error}"
            detail += f"; rows={len(records)}, rows_without_aadt={no_aadt}, rows_without_counter_id={no_id}"
            errors.append(detail)
        except Exception as exc:
            errors.append(f"{url}: {exc}")

    TII_AADT_SUMMARY_CACHE.update({
        "loaded": True,
        "counters": [],
        "error": "; ".join(errors) or "No public AADT summary counters loaded"
    })
    return []


def load_tii_counters():
    if TII_COUNTER_CACHE["loaded"]:
        return TII_COUNTER_CACHE["counters"]
    errors = []
    try:
        counters = _load_tii_counter_locations_from_geojson()
        if counters:
            TII_COUNTER_CACHE.update({"loaded": True, "counters": counters, "error": None})
            return counters
    except Exception as exc:
        errors.append(str(exc))

    # If the open-data GeoJSON is blocked, try the TII public AADT summary report.
    # In v22 the summary rows are joined to counter locations where possible.
    try:
        summary_counters = load_tii_public_aadt_summary_counters()
        if summary_counters:
            TII_COUNTER_CACHE.update({"loaded": True, "counters": summary_counters, "error": None})
            return summary_counters
    except Exception as exc:
        errors.append(f"TII public AADT summary fallback: {exc}")

    summary_err = TII_AADT_SUMMARY_CACHE.get("error")
    if summary_err:
        errors.append(f"TII public AADT summary fallback: {summary_err}")
    TII_COUNTER_CACHE.update({"loaded": True, "counters": [], "error": "; ".join(errors) or "No TII counters loaded"})
    return []

def nearest_tii_counters(site, limit=8, max_km=35):
    counters = load_tii_counters()
    ranked = []
    for counter in counters:
        d = haversine_km(site["lat"], site["lon"], counter["lat"], counter["lon"])
        if d <= max_km:
            ranked.append({**counter, "distance_km": d})
    ranked.sort(key=lambda x: x["distance_km"])
    return ranked[:limit]



def nearest_tii_aadt_summary_for_site(site, address: str = "", limit: int = 6, max_km: float = 75.0):
    """Use the TII public AADT Summary Report as the first-choice automatic source.

    This follows the user's preferred workflow: use the public TII AADT summary
    list, locate the nearest published counter point to the geocoded address, and
    apply the AADT from that list. The selected counter and the other nearest
    candidates are returned for auditability.
    """
    counters = load_tii_public_aadt_summary_counters()
    if not counters:
        err = TII_AADT_SUMMARY_CACHE.get("error")
        raise RuntimeError(err or "No usable TII AADT Summary counters loaded")

    candidates = []
    for counter in counters:
        d = haversine_km(site["lat"], site["lon"], counter["lat"], counter["lon"])
        if d <= max_km:
            c = {**counter, "distance_km": d, "route_score": route_hint_score(address, counter)}
            # Nearest counter is most important. Route hints help when the user
            # searches a corridor/road name in the address.
            c["selection_score"] = c["route_score"] - min(60, d * 1.8)
            candidates.append(c)

    if not candidates:
        raise RuntimeError("TII AADT Summary loaded, but no counter was close enough to the searched site")

    candidates.sort(key=lambda c: (-c.get("selection_score", -999), c.get("distance_km", 999)))
    selected = candidates[0]
    distance = selected.get("distance_km", 999)
    confidence = "high" if distance <= 5 else "medium" if distance <= 15 else "low"
    audit_candidates = []
    for c in candidates[:limit]:
        audit_candidates.append({
            "counter_id": c.get("cosit"),
            "counter_name": c.get("name"),
            "route": c.get("route"),
            "distance_km": round(c.get("distance_km", 0), 2),
            "aadt": c.get("precomputed_aadt"),
            "valid_days": "published AADT summary",
            "year_used": c.get("aadt_year") or "latest in report",
            "status": "ok",
            "selected": c.get("cosit") == selected.get("cosit"),
        })

    route_label = selected.get("route") or selected.get("name") or selected.get("cosit")
    year_label = selected.get("aadt_year") or "latest available"
    return {
        "aadt": int(selected["precomputed_aadt"]),
        "source": f"TII AADT Summary Report · nearest counter · {route_label} · {year_label}",
        "confidence": confidence,
        "provider": "Transport Infrastructure Ireland AADT Summary Report",
        "counter_id": selected.get("cosit"),
        "counter_name": selected.get("name"),
        "route": selected.get("route"),
        "counter_distance_km": round(distance, 2),
        "sample_days": "published AADT summary",
        "sample_period": str(year_label),
        "sample_mode": "TII AADT Summary nearest point",
        "candidates": audit_candidates,
        "reference": TII_PUBLIC_AADT_SUMMARY_URLS[0],
        "method_note": "Automatically geocodes the searched address, loads the TII AADT Summary Report, selects the nearest published counter point, and applies the AADT value from that list. Treat as a corridor AADT proxy where the charging site is not directly on the countered road.",
    }


def completed_years_for_tii(max_years=5):
    """Return recent completed years to try for official TII counter data."""
    this_year = dt.date.today().year
    return [this_year - i for i in range(1, max_years + 1)]


def spread_sample_dates(year: int, mode: str = "balanced") -> list[dt.date]:
    """Build an annual sample across seasons.

    full mode tries every day in the year. Balanced mode uses four days per month.
    Quick mode uses one mid-month day per month.
    """
    if mode == "full":
        start = dt.date(year, 1, 1)
        end = dt.date(year + 1, 1, 1)
        dates = []
        d = start
        while d < end:
            dates.append(d)
            d += dt.timedelta(days=1)
        return dates
    if mode == "quick":
        return [dt.date(year, m, 15) for m in range(1, 13)]
    # balanced default: one day from each week bucket in a month.
    dates = []
    for m in range(1, 13):
        for day in (1, 8, 15, 22):
            try:
                dates.append(dt.date(year, m, day))
            except ValueError:
                pass
    return dates


def daily_counts_for_counters(date_obj: dt.date, cosits: set[str]) -> dict[str, int]:
    yyyy = f"{date_obj.year:04d}"
    mm = f"{date_obj.month:02d}"
    dd = f"{date_obj.day:02d}"
    url = TII_DAILY_AGGR_URL.format(yyyy=yyyy, mm=mm, dd=dd)
    if url in TII_DAILY_CSV_CACHE:
        text = TII_DAILY_CSV_CACHE[url]
    else:
        text = http_text(url, timeout=18.0)
        TII_DAILY_CSV_CACHE[url] = text

    totals = {c: 0 for c in cosits}
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return totals
    headers = {h.lower().replace(" ", "").replace("_", ""): h for h in reader.fieldnames}

    def pick(row, candidates):
        for candidate in candidates:
            key = candidate.lower().replace(" ", "").replace("_", "")
            if key in headers:
                return row.get(headers[key])
        for raw_key, value in row.items():
            norm = str(raw_key).lower().replace(" ", "").replace("_", "")
            if any(candidate.lower().replace(" ", "").replace("_", "") in norm for candidate in candidates):
                return value
        return None

    for row in reader:
        cosit = normalise_cosit(pick(row, ["CoSit", "COSIT", "site", "siteid", "counter", "counterid", "tmuid"]))
        if cosit not in totals:
            continue
        raw_count = pick(row, ["VehicleCount", "vehicle_count", "count", "Total", "Volume", "TrafficVolume", "Vehicles"])
        try:
            totals[cosit] += int(float(str(raw_count).strip().strip('"')))
        except Exception:
            continue
    return totals


def aadt_for_counter_samples(counter: dict, dates: list[dt.date], min_valid_days: int = 6) -> dict:
    if counter.get("precomputed_aadt"):
        return {
            **counter,
            "status": "ok",
            "aadt": int(round(float(counter["precomputed_aadt"]))),
            "valid_days": 365 if counter.get("aadt_year") else 1,
            "first_sample_date": str(counter.get("aadt_year") or "TII summary"),
            "last_sample_date": str(counter.get("aadt_year") or "TII summary"),
            "sample_dates": [],
            "min_sample_day": None,
            "max_sample_day": None,
            "errors": [],
            "from_public_summary": True,
        }
    values = []
    errors = []
    cosit = counter["cosit"]
    for date_obj in dates:
        try:
            totals = daily_counts_for_counters(date_obj, {cosit})
            total = totals.get(cosit, 0)
            if total > 0:
                values.append({"date": date_obj.isoformat(), "total": int(total)})
        except Exception as exc:
            errors.append(f"{date_obj.isoformat()}: {exc}")
            continue
    if len(values) < min_valid_days:
        return {
            **counter,
            "status": "no-usable-aadt",
            "aadt": None,
            "valid_days": len(values),
            "errors": errors[:5],
        }
    avg = round(sum(v["total"] for v in values) / len(values))
    return {
        **counter,
        "status": "ok",
        "aadt": avg,
        "valid_days": len(values),
        "first_sample_date": values[0]["date"],
        "last_sample_date": values[-1]["date"],
        "sample_dates": [v["date"] for v in values[:12]],
        "min_sample_day": min(v["total"] for v in values),
        "max_sample_day": max(v["total"] for v in values),
        "errors": errors[:5],
    }


def route_hint_score(address: str, counter: dict) -> int:
    text = (address or "").lower()
    hay = f"{counter.get('route','')} {counter.get('name','')}".lower()
    score = 0
    route_tokens = re.findall(r"\b[MN]\d{1,3}\b", text.upper())
    for token in route_tokens:
        if token.lower() in hay:
            score += 20
    # Cork/Ballincollig retail sites in the Excel model are normally N40/N22 corridor proxies.
    if any(x in text for x in ["ballincollig", "castlewest", "p31"]):
        if "n40" in hay or "n22" in hay:
            score += 10
    return score


def tii_aadt_for_site(site, address: str = "", mode: str = "balanced"):
    nearest = nearest_tii_counters(site, limit=10, max_km=45)
    if not nearest:
        err = TII_COUNTER_CACHE.get("error")
        raise RuntimeError(err or "No TII traffic counters found near the selected site")

    # Try recent completed years. For each year, evaluate all candidate counters.
    last_error = None
    evaluated = []
    for year in completed_years_for_tii(max_years=5):
        dates = spread_sample_dates(year, mode=mode)
        min_days = 180 if mode == "full" else 18 if mode == "balanced" else 6
        year_results = []
        for counter in nearest:
            try:
                result = aadt_for_counter_samples(counter, dates, min_valid_days=min_days)
                result["year_used"] = year
                result["mode"] = mode
                result["route_score"] = route_hint_score(address, counter)
                if result.get("status") == "ok":
                    # Selection score: nearest is best, but route match and sample completeness matter.
                    result["selection_score"] = (
                        result["route_score"]
                        + min(15, result.get("valid_days", 0) / max(1, len(dates)) * 15)
                        - min(25, result.get("distance_km", 99) * 1.25)
                    )
                else:
                    result["selection_score"] = -999
                year_results.append(result)
            except Exception as exc:
                last_error = exc
                year_results.append({**counter, "status": "error", "aadt": None, "valid_days": 0, "year_used": year, "mode": mode, "errors": [str(exc)], "selection_score": -999})
        evaluated = year_results
        ok = [r for r in year_results if r.get("status") == "ok" and r.get("aadt")]
        if ok:
            ok.sort(key=lambda r: (-r.get("selection_score", -999), r.get("distance_km", 99)))
            selected = ok[0]
            distance = selected["distance_km"]
            valid_days = selected.get("valid_days", 0)
            sample_ratio = valid_days / max(1, len(dates))
            confidence = "high" if sample_ratio >= 0.75 and distance <= 8 else "medium" if sample_ratio >= 0.35 and distance <= 20 else "low"
            route_label = selected.get("route") or selected.get("name") or selected.get("cosit")
            candidates = []
            for c in sorted(year_results, key=lambda r: (-r.get("selection_score", -999), r.get("distance_km", 99)))[:5]:
                candidates.append({
                    "counter_id": c.get("cosit"),
                    "counter_name": c.get("name"),
                    "route": c.get("route"),
                    "distance_km": round(c.get("distance_km", 0), 2),
                    "aadt": c.get("aadt"),
                    "valid_days": c.get("valid_days", 0),
                    "year_used": c.get("year_used"),
                    "status": c.get("status"),
                    "selected": c.get("cosit") == selected.get("cosit"),
                })
            source_label = f"TII automatic AADT · {route_label} · {valid_days}/{len(dates)} sample days · {year}"
            method_note = "Fully automated estimate from official TII open data: nearest candidate counters are tested against the daily per-site-class aggregated CSV files, then ranked by route relevance, data completeness and distance. Treat as a corridor AADT proxy where the charging site is not directly on the countered road."
            if selected.get("from_public_summary"):
                source_label = f"TII public AADT summary · {route_label} · {selected.get('aadt_year') or 'latest available'}"
                method_note = "Fully automated estimate from the TII public AADT Summary Report exposed through the trafficdata.tii.ie reporting system. Counter rows are ranked by distance and route relevance. Treat as a corridor AADT proxy where the charging site is not directly on the countered road."
                confidence = "high" if distance <= 8 else "medium" if distance <= 20 else "low"
            return {
                "aadt": int(selected["aadt"]),
                "source": source_label,
                "confidence": confidence,
                "provider": "Transport Infrastructure Ireland traffic counter data",
                "counter_id": selected.get("cosit"),
                "counter_name": selected.get("name"),
                "route": selected.get("route"),
                "counter_distance_km": round(distance, 2),
                "sample_days": valid_days,
                "sample_period": f"{year}",
                "sample_mode": mode,
                "candidates": candidates,
                "reference": "https://trafficdata.tii.ie/publicmultinodemap.asp",
                "method_note": method_note,
            }
    raise RuntimeError(f"TII counter data was located but no usable automatic AADT could be calculated. Last error: {last_error}; candidates checked: {len(evaluated)}")

def estimate_traffic(site, address="", matched_dataset=None):
    # v35.1 reliability guard: for curated Newmarket/local validation fallbacks,
    # return the curated AADT immediately rather than blocking first-screen UX on
    # slow external TII enrichment. Users can still import/override TII AADT.
    if matched_dataset and "newmarket" in str(site.get("name", "")).lower():
        traffic = dict(matched_dataset.get("traffic", {}))
        traffic.setdefault("method_note", "Curated Newmarket fallback used to keep address search responsive. Validate with TII map/import or manual AADT for investment-grade diligence.")
        traffic.setdefault("provider", "Curated local fallback")
        return traffic

    # 1. Always try the uploaded TII AADT Summary Excel / TII lookup first.
    #    Earlier demo versions protected the Ballincollig Excel reference at
    #    39,800 AADT. The product now treats Ballincollig the same as any other
    #    searched site, so the TII lookup is used first and local seed traffic is
    #    only a fallback.

    # 2. First try the uploaded TII AADT Summary Excel as a stable local database.
    #    If the official TII location file is reachable, the Excel rows are joined
    #    by Site ID and the nearest coordinate-enriched counter is used. If not,
    #    the engine falls back to the multi-tag text lookup from the same Excel.
    tii_errors = []
    try:
        return tii_aadt_priority_counter_lookup(address, site)
    except Exception as exc:
        tii_errors.append(f"Uploaded TII AADT Excel priority place/city lookup: {exc}")
    try:
        return tii_aadt_from_local_excel_nearest_coordinate(site, address)
    except Exception as exc:
        tii_errors.append(f"Uploaded TII AADT Excel nearest-coordinate lookup: {exc}")
    try:
        return tii_aadt_from_local_excel_name_lookup(address)
    except Exception as exc:
        tii_errors.append(f"Uploaded TII AADT Excel name lookup: {exc}")

    # 3. Then try the user's requested TII AADT Summary Report workflow:
    #    geocode address -> load TII summary list -> select nearest published
    #    counter point -> apply the AADT value from that list.
    try:
        return nearest_tii_aadt_summary_for_site(site, address=address)
    except Exception as exc:
        tii_errors.append(f"TII AADT Summary nearest-point lookup: {exc}")

    # 4. If the summary report is unavailable or cannot be parsed, fall back to
    #    the daily counter-file calculation workflow from TII open data.
    try:
        return tii_aadt_for_site(site, address=address, mode="balanced")
    except Exception as exc:
        tii_errors.append(f"TII daily counter calculation: {exc}")

    tii_error = " | ".join(tii_errors)

    # 4. Fall back to the curated demo seed only if TII is unavailable.
    if matched_dataset:
        traffic = dict(matched_dataset["traffic"])
        traffic["source"] = f"{traffic.get('source', 'Curated local estimate')} · TII lookup unavailable"
        traffic["confidence"] = f"{traffic.get('confidence', 'fallback')} / verify manually"
        traffic["provider"] = "Local validation fallback"
        traffic["tii_error"] = tii_error
        traffic["method_note"] = "Fallback only. Use manual override if better traffic data is available."
        return traffic

    # 4. Last-resort estimate so the demo remains usable, clearly labelled.
    return {
        "aadt": 12000,
        "source": "Fallback AADT estimate only — manual verification recommended",
        "confidence": "low / fallback",
        "provider": "Fallback estimate",
        "tii_error": tii_error,
        "method_note": "No official TII counter estimate could be calculated for this search. Manual AADT override is recommended.",
    }


def _charger_key(charger):
    name = str(charger.get("name", "")).strip().lower()
    lat = round(float(charger.get("lat", 0) or 0), 4)
    lon = round(float(charger.get("lon", 0) or 0), 4)
    return (name, lat, lon)


def merge_chargers(primary, fallback):
    """Merge live charger records with curated fallback records without duplicates."""
    merged = []
    seen = set()
    for group in (primary or []), (fallback or []):
        for charger in group:
            key = _charger_key(charger)
            if key in seen:
                continue
            seen.add(key)
            merged.append(charger)
    return merged



def search_coordinates(lat, lon, radius_km, address="Manual map point"):
    start = time.time()
    site = {
        "name": address or f"Manual map point {lat:.6f}, {lon:.6f}",
        "lat": float(lat),
        "lon": float(lon),
        "source": "Manual map point selected on map",
        "confidence": "manual coordinates"
    }
    try:
        traffic = tii_aadt_from_local_excel_nearest_coordinate(site, address or "manual map point")
        traffic["method_note"] = f"Manual map point selected at {lat:.6f}, {lon:.6f}. AADT is selected from the nearest coordinate-enriched TII counter and should be validated for investment-grade diligence."
    except Exception as exc:
        try:
            traffic = tii_aadt_from_local_excel_name_lookup(address or "manual map point")
            traffic["method_note"] = f"Manual map point selected at {lat:.6f}, {lon:.6f}. Text-based AADT was used because nearest coordinate matching failed: {exc}"
        except Exception:
            traffic = {
                "aadt": 12000,
                "source": "Fallback AADT estimate only — manual map point",
                "confidence": "low / manual coordinate fallback",
                "provider": "Manual coordinate fallback",
                "method_note": "Manual map point is exact, but traffic data should be validated with TII map/import or manual AADT."
            }
    provider_log = []
    live_chargers = []
    try:
        if time.time() - start > 14:
            raise TimeoutError("Skipped live charger lookup because coordinate search reached the response time budget.")
        live = overpass_chargers(site, radius_km)
        live_chargers = with_distances(site, live)
        provider_log.append({"provider": "OpenStreetMap / Overpass", "status": "ok", "count": len(live_chargers)})
    except Exception as exc:
        provider_log.append({"provider": "OpenStreetMap / Overpass", "status": "failed", "error": str(exc)})
    return {
        "ok": True,
        "site": site,
        "traffic": traffic,
        "chargers": live_chargers,
        "warning": "Manual map point selected. Coordinates are exact; validate AADT source before investment decision.",
        "provider_log": {
            "geocode_attempts": [{"provider": "manual map point", "status": "manual", "lat": lat, "lon": lon}],
            "charger_providers": provider_log,
            "traffic_provider": {
                "provider": traffic.get("provider", traffic.get("source", "unknown")),
                "source": traffic.get("source"),
                "confidence": traffic.get("confidence"),
                "counter_id": traffic.get("counter_id"),
                "counter_name": traffic.get("counter_name"),
                "counter_distance_km": traffic.get("counter_distance_km"),
            },
        },
        "debug": {
            "elapsed_seconds": round(time.time() - start, 3),
            "radius_km": radius_km,
            "server": "local_site_location_server.py",
            "manual_map_point": True,
        },
    }

def search(address, radius_km):
    start = time.time()
    dataset = local_match(address)
    geocode_attempts = []
    geocode_error = None

    try:
        site, geocode_attempts = geocode(address)
    except Exception as exc:
        geocode_error = str(exc)
        # Do not stop the whole search just because free geocoding failed. The
        # AADT engine can still run from the uploaded TII Excel text database.
        if dataset:
            site = dict(dataset["site"])
            geocode_attempts = [{"provider": "local validation geocoder", "status": "matched_after_provider_failure"}]
        else:
            site = known_place_fallback(address)
            geocode_attempts = [{"provider": "known Irish place fallback" if site else "all geocoders", "status": "matched_after_provider_failure" if site else "failed", "error": geocode_error}]

    # Estimate traffic independently of map/geocoding where possible.
    traffic = None
    traffic_warning = None
    if site:
        traffic = estimate_traffic(site, address, dataset)
    else:
        # TII/local text lookup path when we have no coordinates.
        try:
            try:
                traffic = tii_aadt_priority_counter_lookup(address, None)
            except Exception:
                traffic = tii_aadt_from_local_excel_name_lookup(address)
            traffic["source"] = f"{traffic.get('source')} · address could not be mapped"
            traffic["confidence"] = f"{traffic.get('confidence')} / no map geocode"
            traffic_warning = "Address could not be mapped, but AADT was matched from the uploaded TII AADT Excel by text. Use manual coordinates/API geocoding for map accuracy."
            derived_site = _site_from_traffic_candidates(address, traffic)
            known_site = known_place_fallback(address)
            if derived_site:
                site = derived_site
                traffic_warning = "Address could not be exactly mapped, so the map is centred on the nearest matched TII counter coordinates. Use manual/API geocoding for rooftop accuracy."
            elif known_site:
                site = known_site
                traffic_warning = "Address could not be exactly mapped, so the map is centred on the nearest known Irish place match. Use manual/API geocoding for rooftop accuracy."
            else:
                site = {"name": address, "lat": 53.35, "lon": -7.70, "source": "Ireland-centre fallback after geocoding failure", "confidence": "map fallback"}
        except Exception as exc:
            traffic_warning = f"Address could not be mapped and TII AADT text lookup failed: {exc}"
            if dataset:
                site = dict(dataset["site"])
                traffic = dict(dataset["traffic"])
            else:
                site = {"name": address, "lat": 53.35, "lon": -7.70, "source": "Ireland-centre fallback only — no known town/place match", "confidence": "unresolved map fallback"}
                traffic = {
                    "aadt": 12000,
                    "source": "Fallback AADT estimate only — address/geocoder and TII lookup failed",
                    "confidence": "low / fallback",
                    "provider": "Fallback estimate",
                    "method_note": "Configure a geocoding provider, use the TII map/import workflow, or manually override AADT for this address.",
                    "tii_error": traffic_warning,
                }

    provider_log = []
    curated_chargers = with_distances(site, dataset.get("chargers", [])) if dataset else []
    if dataset:
        provider_log.append({"provider": "local curated validation dataset", "status": "matched", "count": len(curated_chargers)})

    live_chargers = []
    try:
        if time.time() - start > 14:
            raise TimeoutError("Skipped live charger lookup because address/AADT search reached the response time budget.")
        live = overpass_chargers(site, radius_km)
        live_chargers = with_distances(site, live)
        provider_log.append({"provider": "OpenStreetMap / Overpass", "status": "ok", "count": len(live_chargers)})
    except Exception as exc:
        provider_log.append({"provider": "OpenStreetMap / Overpass", "status": "failed", "error": str(exc)})

    # Prefer live OSM/Overpass results where available, but keep curated validation
    # records as fallback so common test sites such as airports still show useful
    # nearby charger cards if Overpass is unavailable, slow, or incomplete.
    chargers = merge_chargers(live_chargers, curated_chargers)

    warning = traffic_warning
    if geocode_error and not warning:
        warning = "Address geocoding failed through free/open providers. AADT may still be matched by TII text lookup; configure Autoaddress, Google or Mapbox for reliable Irish address mapping."

    return {
        "ok": True,
        "site": site,
        "traffic": traffic,
        "chargers": chargers,
        "warning": warning,
        "provider_log": {
            "geocode_attempts": geocode_attempts,
            "charger_providers": provider_log,
            "traffic_provider": {
                "provider": traffic.get("provider", traffic.get("source", "unknown")),
                "source": traffic.get("source"),
                "confidence": traffic.get("confidence"),
                "counter_id": traffic.get("counter_id"),
                "counter_name": traffic.get("counter_name"),
                "counter_distance_km": traffic.get("counter_distance_km"),
                "sample_days": traffic.get("sample_days"),
                "tii_error": traffic.get("tii_error"),
                "location_enrichment": traffic.get("location_enrichment") or dict(TII_LOCATION_ENRICHMENT_CACHE),
            },
        },
        "debug": {
            "elapsed_seconds": round(time.time() - start, 3),
            "radius_km": radius_km,
            "server": "local_site_location_server.py",
            "address_provider_config": config_status(),
            "address_accuracy_note": "For all Irish addresses/Eircodes, configure Autoaddress, GeoDirectory/GeoAddress, Google, or Mapbox. Free open fallback cannot guarantee every Eircode.",
            "geocode_error": geocode_error,
        },
    }


# ---------------------------------------------------------------------------
# TII monthly-volume Excel import workflow
# ---------------------------------------------------------------------------
# The TII public map can generate a monthly-volume Excel report from Site Data.
# This parser lets a user download that report manually and import it into the
# local app. This avoids brittle screen automation of the external TII map while
# preserving an auditable, high-accuracy source path.


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(float(v))


def _cell_text(v):
    if v is None:
        return ""
    return str(v).strip()


def _looks_like_date(v):
    if isinstance(v, (dt.date, dt.datetime)):
        return True
    s = _cell_text(v).lower()
    if not s:
        return False
    return bool(re.search(r"\b\d{1,2}[/\-]\d{1,2}([/\-]\d{2,4})?\b", s) or re.search(r"\b(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", s))


def _nearby_numeric(matrix, r, c, radius=3):
    vals = []
    for rr in range(max(0, r-radius), min(len(matrix), r+radius+1)):
        row = matrix[rr]
        for cc in range(max(0, c-radius), min(len(row), c+radius+1)):
            v = row[cc]
            if _is_number(v) and float(v) > 100:
                vals.append(float(v))
    return vals


def _header_map(row):
    return {i: _cell_text(v).lower() for i, v in enumerate(row)}


def _best_total_column(headers):
    best = None
    for i, h in headers.items():
        if not h:
            continue
        score = 0
        if "total" in h: score += 5
        if "volume" in h or "count" in h or "traffic" in h: score += 3
        if "all" in h or "vehicle" in h or "vehicles" in h: score += 2
        if "speed" in h or "class" in h or "percentage" in h or "%" in h: score -= 6
        if score > 0 and (best is None or score > best[0]):
            best = (score, i)
    return best[1] if best else None


def _parse_matrix_for_aadt(matrix, source_name="TII monthly volume report"):
    # 1) Direct AADT/ADT/average daily traffic value if the report has one.
    for r, row in enumerate(matrix):
        for c, v in enumerate(row):
            s = _cell_text(v).lower()
            if any(term in s for term in ["annual average daily traffic", "average annual daily traffic", "aadt", "average daily traffic", "adt"]):
                nums = _nearby_numeric(matrix, r, c, radius=3)
                if nums:
                    val = round(max(nums))
                    return {
                        "aadt": val,
                        "method": "AADT/average-daily-traffic value read directly from imported TII report",
                        "valid_days": None,
                        "daily_values_used": None,
                    }

    # 2) Monthly total + valid days labels.
    monthly_total = None
    valid_days = None
    for r, row in enumerate(matrix):
        row_text = " ".join(_cell_text(v).lower() for v in row)
        nums = [float(v) for v in row if _is_number(v)]
        if nums and any(x in row_text for x in ["monthly total", "total volume", "total vehicles", "total traffic"]):
            monthly_total = max(nums)
        if nums and any(x in row_text for x in ["valid days", "number of days", "days included", "days used"]):
            maybe = [n for n in nums if 1 <= n <= 31]
            if maybe:
                valid_days = int(max(maybe))
    if monthly_total and valid_days:
        return {
            "aadt": round(monthly_total / valid_days),
            "method": "Monthly total volume divided by valid days from imported TII report",
            "valid_days": valid_days,
            "daily_values_used": None,
        }

    # 3) Daily rows. Use a total-volume column if available, otherwise use the
    # largest high-volume number in each date/day row. The largest-value fallback
    # avoids double-counting when reports include class or direction subtotals.
    header = {}
    total_col = None
    daily_values = []
    for row in matrix:
        non_empty = [_cell_text(v) for v in row if _cell_text(v)]
        row_text = " ".join(x.lower() for x in non_empty)
        if any(word in row_text for word in ["date", "day", "total", "volume", "traffic", "vehicles"]):
            candidate = _header_map(row)
            col = _best_total_column(candidate)
            if col is not None:
                header = candidate
                total_col = col
                continue

        has_date = any(_looks_like_date(v) for v in row)
        # Sometimes the report uses day number as the first column.
        first = row[0] if row else None
        has_day_number = _is_number(first) and 1 <= int(first) <= 31 and len(row) >= 3
        if not (has_date or has_day_number):
            continue
        if any(x in row_text for x in ["average", "monthly", "grand total", "subtotal"]):
            continue

        chosen = None
        if total_col is not None and total_col < len(row) and _is_number(row[total_col]) and float(row[total_col]) > 100:
            chosen = float(row[total_col])
        else:
            nums = []
            for idx, v in enumerate(row):
                if not _is_number(v):
                    continue
                val = float(v)
                if idx == 0 and has_day_number and val <= 31:
                    continue
                if val > 100:
                    nums.append(val)
            if nums:
                chosen = max(nums)
        if chosen and chosen > 100:
            daily_values.append(chosen)

    # De-duplicate obvious repeated totals while keeping month-length data.
    if daily_values:
        return {
            "aadt": round(sum(daily_values) / len(daily_values)),
            "method": "Average of daily traffic volumes parsed from imported TII monthly-volume report",
            "valid_days": len(daily_values),
            "daily_values_used": len(daily_values),
        }

    raise ValueError("Could not find AADT, monthly total, valid days, or daily volume rows in the imported file. Please export the TII Monthly Volume Excel from Site Data.")


def parse_tii_monthly_volume_file(raw: bytes, filename: str) -> dict:
    lower = (filename or "").lower()
    matrices = []
    if lower.endswith(".xlsx") or lower.endswith(".xlsm") or raw[:2] == b"PK":
        try:
            import openpyxl
        except Exception as exc:
            raise RuntimeError(f"openpyxl is required to parse Excel files but is not available: {exc}")
        wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
        for ws in wb.worksheets:
            matrix = [list(row) for row in ws.iter_rows(values_only=True)]
            matrices.append((ws.title, matrix))
    else:
        text = raw.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
        matrices.append((filename or "CSV", rows))

    errors = []
    for sheet_name, matrix in matrices:
        try:
            result = _parse_matrix_for_aadt(matrix, source_name=sheet_name)
            result.update({
                "filename": filename,
                "sheet": sheet_name,
                "source": "Imported TII Monthly Volume Excel",
                "provider": "Transport Infrastructure Ireland trafficdata.tii.ie manual import",
                "confidence": "high / user-selected TII site report",
                "reference": "https://trafficdata.tii.ie/publicmultinodemap.asp",
                "method_note": "User selected the nearest TII counter in the official TII map, downloaded the Monthly Volume Excel from Site Data, and imported it into the app. AADT is calculated from the report values and should be treated as the selected counter's corridor AADT.",
            })
            return result
        except Exception as exc:
            errors.append(f"{sheet_name}: {exc}")
    raise ValueError("No usable traffic volume table found. " + "; ".join(errors[:5]))


def _extract_multipart_file(body: bytes, content_type: str) -> tuple[str, bytes]:
    match = re.search(r"boundary=([^;]+)", content_type or "")
    if not match:
        raise ValueError("Missing multipart boundary")
    boundary = match.group(1).strip().strip('"').encode()
    for part in body.split(b"--" + boundary):
        if b"Content-Disposition" not in part:
            continue
        header_blob, _, data = part.partition(b"\r\n\r\n")
        if not data:
            continue
        headers = header_blob.decode("utf-8", errors="replace")
        if 'name="file"' not in headers:
            continue
        fname_match = re.search(r'filename="([^"]*)"', headers)
        filename = fname_match.group(1) if fname_match else "tii-monthly-volume.xlsx"
        data = data.rsplit(b"\r\n", 1)[0]
        return filename, data
    raise ValueError("No uploaded file field named 'file' was found")


def _auth_token() -> str:
    """Stable HMAC token for the demo password session cookie."""
    if not DEMO_PASSWORD:
        return ""
    return hmac.new(DEMO_SESSION_SECRET.encode("utf-8"), DEMO_PASSWORD.encode("utf-8"), hashlib.sha256).hexdigest()


def _parse_cookie(header: str | None) -> dict[str, str]:
    values: dict[str, str] = {}
    if not header:
        return values
    for part in header.split(";"):
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        values[name.strip()] = value.strip()
    return values


def _login_page(error: str = "") -> bytes:
    safe_error = str(error).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    error_html = '<div class="error">' + safe_error + '</div>' if safe_error else ''
    html = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Private Demo - EV Hub Investment Tool</title>
  <style>
    :root { --green:#148a57; --green2:#24a26c; --bg:#f3f7f4; --text:#162521; --muted:#5f6f69; --line:#dde8e1; --bad:#c05a54; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 12% 0%, rgba(36,162,108,.12), transparent 28rem), linear-gradient(180deg,#f8fbf8,#edf4ef); color:var(--text); padding:24px; }
    main { width:min(480px, 100%); background:rgba(255,255,255,.96); border:1px solid var(--line); border-radius:28px; padding:34px; box-shadow:0 28px 70px rgba(18,36,30,.12); }
    .eyebrow { color:var(--green); text-transform:uppercase; letter-spacing:.1em; font-weight:850; font-size:12px; }
    h1 { margin:8px 0 10px; font-size:34px; line-height:1; letter-spacing:-.05em; }
    p { color:var(--muted); line-height:1.5; margin:0 0 22px; }
    label { display:block; font-size:13px; font-weight:800; margin-bottom:8px; }
    input { width:100%; border:1px solid #cad9d1; border-radius:15px; padding:13px 14px; font:inherit; }
    input:focus { outline:3px solid rgba(20,138,87,.18); border-color:var(--green); }
    button { width:100%; border:0; border-radius:999px; margin-top:16px; padding:13px 18px; font:inherit; font-weight:850; color:white; cursor:pointer; background:linear-gradient(135deg,var(--green),var(--green2)); box-shadow:0 14px 28px rgba(20,138,87,.18); }
    .error { margin:0 0 14px; padding:11px 13px; border-radius:14px; background:#fbe9e7; color:var(--bad); font-weight:750; }
    .note { margin-top:18px; font-size:12px; color:var(--muted); }
  </style>
</head>
<body>
  <main>
    <span class="eyebrow">Private demo</span>
    <h1>EV Hub Investment Tool</h1>
    <p>This demo is password protected. Enter the password shared by the owner to continue.</p>
    __ERROR__
    <form method="post" action="/login">
      <label for="password">Demo password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
      <button type="submit">Open demo</button>
    </form>
    <div class="note">Access can be removed at any time by deleting the hosted service or changing the password.</div>
  </main>
</body>
</html>""".replace("__ERROR__", error_html)
    return html.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def _auth_enabled(self):
        return bool(DEMO_PASSWORD)

    def _is_authenticated(self):
        if not self._auth_enabled():
            return True
        cookies = _parse_cookie(self.headers.get("Cookie"))
        supplied = cookies.get(DEMO_AUTH_COOKIE, "")
        expected = _auth_token()
        return bool(supplied and expected and hmac.compare_digest(supplied, expected))

    def _send_login(self, error=""):
        data = _login_page(error)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _redirect_to_login(self):
        self.send_response(302)
        self.send_header("Location", "/login")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _send_json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def _send_file(self, path: Path, content_type="text/html; charset=utf-8"):
        raw = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        self.wfile.write(raw)


    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/login":
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8", errors="replace")
            params = urllib.parse.parse_qs(body)
            password = (params.get("password") or [""])[0]
            if self._auth_enabled() and hmac.compare_digest(password, DEMO_PASSWORD):
                self.send_response(302)
                self.send_header("Location", "/")
                self.send_header("Set-Cookie", f"{DEMO_AUTH_COOKIE}={_auth_token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age={DEMO_AUTH_MAX_AGE}")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            if not self._auth_enabled():
                self.send_response(302)
                self.send_header("Location", "/")
                self.end_headers()
                return
            return self._send_login("Incorrect password. Please try again.")
        if not self._is_authenticated():
            return self._redirect_to_login()
        if parsed.path == "/api/auto-tii-aadt":
            params = urllib.parse.parse_qs(parsed.query)
            address = params.get("address", [""])[0]
            mode = params.get("mode", ["balanced"])[0]
            try:
                dataset = local_match(address) if address else None
                if dataset and dataset.get("traffic", {}).get("confidence") == "golden-reference":
                    traffic = dict(dataset["traffic"])
                    traffic.update({
                        "provider": "Excel model / TII N40 reference",
                        "method_note": "Golden reference case preserved from the Excel production model.",
                        "reference": "https://trafficdata.tii.ie/publicmultinodemap.asp",
                    })
                    return self._send_json({"ok": True, "traffic": traffic})
                site = None
                try:
                    lat = float(params.get("lat", [""])[0])
                    lon = float(params.get("lon", [""])[0])
                    site = {"name": address or "Selected site", "lat": lat, "lon": lon, "source": "current site coordinates"}
                except Exception:
                    pass
                if site:
                    try:
                        traffic = tii_aadt_from_local_excel_nearest_coordinate(site, address)
                    except Exception:
                        traffic = tii_aadt_from_local_excel_name_lookup(address)
                else:
                    # Do not require geocoding just to get an AADT text match.
                    try:
                        traffic = tii_aadt_from_local_excel_name_lookup(address)
                    except Exception:
                        site, _ = geocode(address)
                        try:
                            traffic = tii_aadt_from_local_excel_nearest_coordinate(site, address)
                        except Exception:
                            traffic = tii_aadt_for_site(site, address=address, mode=mode if mode in {"quick", "balanced", "full"} else "balanced")
                return self._send_json({"ok": True, "traffic": traffic})
            except Exception as exc:
                return self._send_json({"ok": False, "error": str(exc)})

        if parsed.path == "/api/import-tii-monthly-volume":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                content_type = self.headers.get("Content-Type", "")
                body = self.rfile.read(length)
                filename, data = _extract_multipart_file(body, content_type)
                parsed_report = parse_tii_monthly_volume_file(data, filename)
                return self._send_json({"ok": True, "traffic": parsed_report})
            except Exception as exc:
                return self._send_json({"ok": False, "error": str(exc)}, status=400)
        return self.send_error(404, "Not found")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/login":
            if self._is_authenticated():
                self.send_response(302)
                self.send_header("Location", "/")
                self.end_headers()
                return
            return self._send_login()
        if parsed.path == "/logout":
            self.send_response(302)
            self.send_header("Location", "/login")
            self.send_header("Set-Cookie", f"{DEMO_AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        if not self._is_authenticated():
            return self._redirect_to_login()
        if parsed.path in ("/", "/index.html"):
            return self._send_file(ROOT / "index.html")

        if parsed.path == "/api/auto-tii-aadt":
            params = urllib.parse.parse_qs(parsed.query)
            address = params.get("address", [""])[0]
            mode = params.get("mode", ["balanced"])[0]
            try:
                dataset = local_match(address) if address else None
                if dataset and dataset.get("traffic", {}).get("confidence") == "golden-reference":
                    traffic = dict(dataset["traffic"])
                    traffic.update({
                        "provider": "Excel model / TII N40 reference",
                        "method_note": "Golden reference case preserved from the Excel production model.",
                        "reference": "https://trafficdata.tii.ie/publicmultinodemap.asp",
                    })
                    return self._send_json({"ok": True, "traffic": traffic})
                site = None
                try:
                    lat = float(params.get("lat", [""])[0])
                    lon = float(params.get("lon", [""])[0])
                    site = {"name": address or "Selected site", "lat": lat, "lon": lon, "source": "current site coordinates"}
                except Exception:
                    pass
                if site:
                    try:
                        traffic = tii_aadt_from_local_excel_nearest_coordinate(site, address)
                    except Exception:
                        traffic = tii_aadt_from_local_excel_name_lookup(address)
                else:
                    # Do not require geocoding just to get an AADT text match.
                    try:
                        traffic = tii_aadt_from_local_excel_name_lookup(address)
                    except Exception:
                        site, _ = geocode(address)
                        try:
                            traffic = tii_aadt_from_local_excel_nearest_coordinate(site, address)
                        except Exception:
                            traffic = tii_aadt_for_site(site, address=address, mode=mode if mode in {"quick", "balanced", "full"} else "balanced")
                return self._send_json({"ok": True, "traffic": traffic})
            except Exception as exc:
                return self._send_json({"ok": False, "error": str(exc)})

        if parsed.path == "/api/search":
            params = urllib.parse.parse_qs(parsed.query)
            address = (params.get("address") or [""])[0].strip()
            try:
                radius_km = float((params.get("radius_km") or ["3"])[0])
            except Exception:
                radius_km = 3.0
            lat_param = (params.get("lat") or [""])[0]
            lon_param = (params.get("lon") or [""])[0]
            manual_point = (params.get("manual_point") or [""])[0].lower() in {"1", "true", "yes"}
            try:
                if manual_point or (lat_param and lon_param):
                    lat = float(lat_param)
                    lon = float(lon_param)
                    return self._send_json(search_coordinates(lat, lon, radius_km, address or f"Manual map point: {lat:.6f}, {lon:.6f}"))
            except Exception as exc:
                return self._send_json({"ok": False, "error": f"Invalid manual coordinates: {exc}"}, status=400)
            if not address:
                return self._send_json({"ok": False, "error": "Missing address parameter"}, status=400)
            try:
                return self._send_json(search(address, radius_km))
            except Exception as exc:
                return self._send_json({"ok": False, "error": str(exc)}, status=500)

        # Static file server for the HTML/JS/CSS demo app.
        candidate = (ROOT / parsed.path.lstrip("/")).resolve()
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            return self.send_error(403, "Forbidden")
        if candidate.exists() and candidate.is_file():
            suffix = candidate.suffix.lower()
            content_types = {
                ".html": "text/html; charset=utf-8",
                ".js": "text/javascript; charset=utf-8",
                ".mjs": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".json": "application/json; charset=utf-8",
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg"
            }
            return self._send_file(candidate, content_types.get(suffix, "application/octet-stream"))

        self.send_error(404, "Not found")


def main():
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    url = f"http://localhost:{PORT}/"
    print(f"EV Hub Investment Tool running at {url}")
    print("Opening your default browser...")
    print("Press Ctrl+C to stop.")

    if os.environ.get("DISABLE_BROWSER_OPEN", "0") != "1" and not os.environ.get("RENDER") and not os.environ.get("DEMO_PASSWORD"):
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")


if __name__ == "__main__":
    main()
