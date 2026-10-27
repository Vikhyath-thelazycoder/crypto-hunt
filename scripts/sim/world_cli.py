"""Builds the bot-test world for a TypeScript driver (the demo): prints the fresh admin's sign-in as JSON on stdout.
The password lives only in the caller's memory; the account is deleted by the next world build."""

import asyncio
import json

import world
from lib import http


async def main() -> None:
    async with http(60) as c:
        w = await world.build(c)
    print(json.dumps({"email": w["admin_email"], "password": w["admin_password"]}))


asyncio.run(main())
