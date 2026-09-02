"""ur_relayer_keygen — mint EVM EOAs locally.

Default (UR relayer): generate keypairs and write private keys into
`backend/.env.local` under `UR_RELAYER_PRIVKEY_TESTNET` (single) or
`UR_RELAYER_PRIVKEYS_TESTNET` (comma-separated). Only addresses are printed.

For a throwaway MetaMask import (no env write):

    python backend/ur_relayer_keygen.py --print-key --no-write

Usage
=====

    # Testnet: mint a single key (recommended for first integration)
    python backend/ur_relayer_keygen.py --env testnet

    # Mainnet: mint 4 keys to mirror Bridge2 anti-queue redundancy
    python backend/ur_relayer_keygen.py --env mainnet --count 4

    # Print private key locally; do not write .env.local
    python backend/ur_relayer_keygen.py --print-key --no-write

The script refuses to overwrite an existing env key unless `--no-write`.
If you really want to rotate, delete the relevant line from .env.local first.

`--print-key` prints the hex private key to your terminal only. Do not
screenshot, paste, or commit it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from eth_account import Account


def _env_var_names(env_label: str) -> tuple[str, str]:
    """Return (singular_var, plural_var) for the requested env label."""
    suffix = env_label.upper()
    return f"UR_RELAYER_PRIVKEY_{suffix}", f"UR_RELAYER_PRIVKEYS_{suffix}"


def _existing_value(env_text: str, var_name: str) -> str | None:
    for line in env_text.splitlines():
        line = line.strip()
        if line.startswith(f"{var_name}="):
            return line.split("=", 1)[1].strip()
    return None


def _append_var(env_path: Path, var_name: str, value: str) -> None:
    existing = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    suffix = "" if existing.endswith("\n") or not existing else "\n"
    with env_path.open("a", encoding="utf-8") as f:
        f.write(f"{suffix}{var_name}={value}\n")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    p.add_argument(
        "--env",
        choices=["testnet", "mainnet"],
        default="testnet",
        help="Which UR environment this key is for (default: testnet).",
    )
    p.add_argument(
        "--count",
        type=int,
        default=1,
        help="How many keys to generate (default: 1; 4 is recommended for mainnet).",
    )
    p.add_argument(
        "--env-file",
        default="backend/.env.local",
        help="Path to env file (default: backend/.env.local). Resolved relative to repo root.",
    )
    p.add_argument(
        "--print-key",
        action="store_true",
        help="Print private key(s) to this terminal for local MetaMask import. Never share or commit them.",
    )
    p.add_argument(
        "--no-write",
        action="store_true",
        help="Do not write keys to the env file (print-only generation).",
    )
    args = p.parse_args()

    if args.count < 1:
        print("ERROR: --count must be >= 1", file=sys.stderr)
        return 2
    if args.no_write and not args.print_key:
        print("ERROR: --no-write would discard the key; pass --print-key as well.", file=sys.stderr)
        return 2

    repo_root = Path(__file__).resolve().parent.parent
    env_path = (repo_root / args.env_file).resolve()
    env_text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""

    singular_var, plural_var = _env_var_names(args.env)

    if not args.no_write and (
        _existing_value(env_text, singular_var) or _existing_value(env_text, plural_var)
    ):
        print(
            f"REFUSING TO OVERWRITE: {singular_var} or {plural_var} already exists in "
            f"{env_path}. Delete the line manually if you intend to rotate, "
            f"or pass --no-write --print-key for a one-off account.",
            file=sys.stderr,
        )
        return 1

    keys: list[str] = []
    addresses: list[str] = []
    for _ in range(args.count):
        acct = Account.create()
        pk = acct.key.hex()
        if not pk.startswith("0x"):
            pk = "0x" + pk
        keys.append(pk)
        addresses.append(acct.address)

    var_name = singular_var if args.count == 1 else plural_var
    if not args.no_write:
        _append_var(env_path, var_name, ",".join(keys))

    print(f"Generated {args.count} EOA(s).")
    if args.no_write:
        print("  Did not write to an env file (--no-write).")
    else:
        print(f"  Wrote {var_name} to {env_path}")
    print("  Address(es):")
    for i, addr in enumerate(addresses, 1):
        print(f"    {i}. {addr}")
    if args.print_key:
        print()
        print("  Private key(s) — this terminal only; import into MetaMask then clear the scrollback:")
        for i, (addr, pk) in enumerate(zip(addresses, keys), 1):
            print(f"    {i}. {addr}")
            print(f"       {pk}")
    print()
    if args.print_key:
        print("MetaMask: Account menu → Import account → Private key (paste the 0x… value).")
        print("Do not screenshot, paste, or commit this key.")
    else:
        print("Next steps:")
        print("  1. Send the address(es) above to the UR team so they can whitelist the relayer.")
        print("  2. Fund each address with a tiny bit of Arbitrum-Sepolia ETH + Mantle-Sepolia MNT.")
        print("  3. (Optional) Mirror the same line into Railway env vars when going live.")
        print("  To print the private key locally: re-run with --print-key --no-write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
