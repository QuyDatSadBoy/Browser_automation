from __future__ import annotations
from typing import Dict, Type
from .base import BaseCrawler
from .lovable import LovableCrawler, LOVABLE_PROJECTS
from .openaffiliate import OpenAffiliateCrawler
from .goaffpro import GoAffProCrawler, GOAFFPRO_MAX_CHOICES


SOURCES: Dict[str, Type[BaseCrawler]] = {
    "lovable": LovableCrawler,
    "openaffiliate": OpenAffiliateCrawler,
    "goaffpro": GoAffProCrawler,
}


SOURCE_META = [
    {
        "code": "openaffiliate",
        "name": "OpenAffiliate",
        "base_url": "https://openaffiliate.dev",
        "description": "Directory open-source 750+ affiliate program (PartnerStack, Rewardful, FirstPromoter...). Crawl trực tiếp YAML từ repo GitHub — nhanh, ổn định.",
        "icon_hint": "trophy",
        "highlight": True,
        "options": [],
    },
    {
        "code": "lovable",
        "name": "Lovable Directory",
        "base_url": "https://affiliateprogram.lovable.app",
        "description": "Directory tổng hợp affiliate program phân theo nền tảng (Rewardful, FirstPromoter, Tolt…). Crawl thật bằng Nodriver.",
        "icon_hint": "sparkles",
        "highlight": True,
        "options": [
            {"key": "project", "label": "Chọn nền tảng", "choices": LOVABLE_PROJECTS, "default": "rewardful"},
        ],
    },
    {
        "code": "goaffpro",
        "name": "GoAffPro",
        "base_url": "https://goaffpro.com/affiliate/stores/search",
        "description": "Directory ~22.8k shop Shopify dùng GoAffPro (beauty, apparel, supplements, pets…). Pull trực tiếp public API — nhanh, không cần login.",
        "icon_hint": "shopping-bag",
        "highlight": True,
        "options": [
            {"key": "max_stores", "label": "Số lượng shop", "choices": GOAFFPRO_MAX_CHOICES, "default": "2000"},
        ],
    },
]


def get_crawler(source: str, **kwargs) -> BaseCrawler:
    cls = SOURCES.get(source)
    if not cls:
        raise ValueError(f"Source không hỗ trợ: {source}")
    return cls(**kwargs)
