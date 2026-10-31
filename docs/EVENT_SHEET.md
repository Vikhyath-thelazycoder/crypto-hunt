# Event sheet

For whoever runs the game on the day.

## Before the crews arrive
1. Open the admin panel: **crypto-hunt-liard.vercel.app/admin**.
2. Open the Supabase dashboard for the project in another tab: **Reports → Database** and **Logs**.
3. Open **/screen** on the projector laptop only. Keep one admin tab open, not several.
4. Check the Crews page: every crew must have joined before **Start Hunt**. Remove crews that won't play.

## During the game
Keep one person on the Supabase tab. Look at these every few minutes:

| What you see | What it means | What to do |
|---|---|---|
| CPU or memory staying near the top | The database is struggling | Follow the steps below |
| Many red 5xx or 504 lines in the logs | Requests are failing | Follow the steps below |
| Phones showing "Reconnecting…" | Phones can't reach the server | Follow the steps below if it's more than a few phones |
| "Too many messages per second" in the Realtime logs | Live updates are being limited | Keep watching. Phones still catch up on their own within about a minute |

## If it slows down or crashes
1. Press **Pause** in the admin panel. Nothing counts while paused and penalties freeze.
2. Tell the crews by announcement: "Stay where you are. Don't refresh your phones."
3. Wait until the logs are clean and the CPU has dropped, usually a few minutes. Phones retry on their own, more slowly each time.
4. Press **Resume**.
5. If it doesn't recover in about 10 minutes, tell the crews the game is on hold and call everyone to the venue.

## A crew has a problem
| Problem | Fix |
|---|---|
| Phone died or was lost | Log in on another phone with the same crew code and exactly the same lead name |
| Camera doesn't work | Type the code printed on the card |
| Card is missing or damaged | Admin panel: open the crew and re-point it to a spare, or force-complete the round |

## Winners
The first 3 crews to finish appear in the admin panel with their place and a completion key. After the third, every screen tells crews to come back to the venue.
