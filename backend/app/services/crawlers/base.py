from __future__ import annotations
from abc import ABC, abstractmethod
from typing import List, Dict


class BaseCrawler(ABC):
    source: str = ""
    source_url: str = ""

    @abstractmethod
    async def crawl(self) -> List[Dict]:
        """Return list of program dicts ready for upsert."""
        raise NotImplementedError
