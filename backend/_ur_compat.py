"""No-op stand-ins for UR helpers still referenced in the sliced server.py.

HIP-4 app does not ship banking. These keep leftover rewards/notification
hooks from crashing import. Delete the call sites, then delete this file.
"""

from __future__ import annotations

import os
from typing import Any

# Leftover UR test-wallet import in privy_import.py reads these. Unused in HIP-4.
UR_ENV = (os.getenv("UR_ENV") or "testnet").strip() or "testnet"
UR_SIGNER_PK: str | None = None
UR_SIGNER_ADDRESS: str | None = None

NOTIF_CATEGORIES: frozenset[str] = frozenset()


class URError(Exception):
    pass


async def aclose_async_client() -> None:
    return None


def get_link_by_privy_user(*_args: Any, **_kwargs: Any) -> None:
    return None


def list_notifications(*_args: Any, **_kwargs: Any) -> list:
    return []


def count_unread_notifications(*_args: Any, **_kwargs: Any) -> int:
    return 0


def mark_notification_read(*_args: Any, **_kwargs: Any) -> None:
    return None


def mark_all_notifications_read(*_args: Any, **_kwargs: Any) -> int:
    return 0
