# Trainer Agent (Supabase + Vercel)

An AI personal trainer, powered by Claude, that sits inside your gym app as a chat bubble.

- **Knows the user:** reads their profile and workout logs from your Supabase database (read-only).
- **Remembers:** keeps every conversation and its own short coaching notes about each user, in two new
  Supabase tables.
- **Stays in its lane:** your app owns profiles, programs and logging. The coach never changes your
  app's data. It points users to the app for those.
- **Adapts to experience level** from the user's profile.
- **Shows your exercise videos:** when a user asks how to do an exercise, your app's saved video plays right in the chat.
- **Uses your existing login:** the widget sends the user's Supabase session token, so users don't
  sign in twice.

It deploys as its **own small Vercel project** (e.g. `your-coach.vercel.app`) that your app talks to.
That keeps it separate from your app's code, whatever framework your app uses.

> **Using Claude Code?** Open `CLAUDE_CODE_SETUP.md` and paste the prompt into Claude Code in your
> app's repo. It will match the kit to your tables and add the widget to your app.

```
trainer-agent/
├── api/                    Vercel functions: chat, history, memory
├── agent/
│   ├── systemPrompt.js     Personality, coaching approach, safety rules      ← tune this
│   ├── appData.js          Reads profile + workouts from your tables          ← point at your schema
│   ├── memory*.js          Coach notes + chat history (Supabase; local file for testing)
│   ├── tools.js            What the coach can do (read logs, search past chats, notes)
│   ├── agent.js            The agent loop
│   └── auth.js, http.js, supabase.js
├── supabase/migrations/    SQL for the coach's memory tables (+ optional video library)
├── videos/                 Optional video library file
├── public/widget.js        The chat bubble your app loads
├── demo/app-data.json      Sample user for local testing
└── dev.js                  Local server (npm run dev)
```

## 1. Try it locally (no Supabase needed)

```bash
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
npm test
npm run dev                 # http://localhost:3000
```
You're the demo user "Sam" (data in `demo/app-data.json`). Ask "How's my bench going?", reload,
then ask "What did I ask you earlier?".

## 2. Create the memory tables in Supabase

In the Supabase dashboard, open the **SQL Editor**, paste
`supabase/migrations/20260925000000_coach_memory.sql`, and run it. It creates `coach_notes` and
`coach_messages` with row-level security. Rows are deleted automatically if a user deletes their account.

## 3. Point it at your app's tables

Set these to match your schema (defaults shown):

| Variable | Meaning |
|---|---|
| `PROFILE_TABLE=profiles` | Table with one row per user (experience level, goals, injuries...) |
| `PROFILE_USER_COLUMN=id` | Column holding the Supabase auth user id |
| `WORKOUTS_TABLE=workouts` | Table of logged sessions |
| `WORKOUTS_USER_COLUMN=user_id` | Column holding the auth user id |
| `WORKOUTS_DATE_COLUMN=created_at` | Date used for "newest first" |
| `WORKOUTS_SELECT=*` | Supabase select string. If exercises/sets live in child tables, include them, e.g. `*, workout_exercises(*, sets(*))` |

The coach can read your own column names, so there's no need to reshape your data. It never sees ids,
emails, phone numbers or payment fields. For the level-based coaching, the profile's `experienceLevel`
should be `beginner`, `intermediate` or `advanced`. If your column or values differ, adjust `LEVEL_STYLE`
and the first line of `buildSystemPrompt` in `agent/systemPrompt.js`.

## 4. Deploy to Vercel

1. Push this folder to its own GitHub repo, then **Add New → Project** in Vercel and import it
   (no framework preset, no build command needed).
2. Under **Settings → Environment Variables**, add everything from `.env.example`:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API). The service
     role key is secret. Keep it on Vercel only, never in your app's frontend.
   - Your table settings from step 3
   - `ALLOWED_ORIGINS`: your app's URL, e.g. `https://yourapp.vercel.app`
3. Deploy. Check `https://your-coach.vercel.app/widget.js` loads.

## 5. Add the chat bubble to your app

Load the widget once (e.g. in your root layout):

```html
<script src="https://your-coach.vercel.app/widget.js" data-coach-name="Coach" data-color="#e4572e" defer></script>
```

Then connect it to your existing Supabase login, wherever your app creates its Supabase client:

```js
window.TrainerAgent.setTokenProvider(async () =>
  (await supabase.auth.getSession()).data.session?.access_token);

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") window.TrainerAgent.signOut();
});
```

Optional: `TrainerAgent.open()` from your own "Ask Coach" button, and `TrainerAgent.clearMemory()` from a
"Clear coach memory" option in settings.

## Exercise videos (from your app's library)

Whenever a user asks how to do an exercise, asks about its form, or looks one up ("RDL?"), the coach finds
your app's saved video for it and shows it at the top of its reply as a player in the chat, followed by
a few key cues.

**Point it at your videos.** Set these on Vercel to match where your app saves them:

| Variable | Default | Meaning |
|---|---|---|
| `EXERCISE_VIDEOS_TABLE` | `exercise_videos` | Your table. Can be your existing `exercises` table if the video link is a column there |
| `EXERCISE_VIDEOS_NAME_COLUMN` | `exercise` | Exercise name |
| `EXERCISE_VIDEOS_URL_COLUMN` | `url` | The YouTube link. Any format works: full link, `youtu.be`, Shorts, or just the 11-character video id. Direct `.mp4`/`.webm` links (e.g. Supabase Storage) also play |
| `EXERCISE_VIDEOS_TITLE_COLUMN` | `title` | Optional title shown under the video |
| `EXERCISE_VIDEOS_ALIASES_COLUMN` | `aliases` | Optional other names ("RDL", "stiff leg deadlift"), as an array or comma-separated text |

**How matching works.** Plurals and filler words are ignored, so "RDLs", "how to do Romanian deadlifts" and
"romanian deadlift form" all find the same video. It won't show a video for a *different* exercise: "front squat"
won't bring up your back squat video. In that case the coach gets the closest names you do have, and uses one
only if it's clearly the same exercise. Adding aliases to your videos helps most. The library is cached for
5 minutes, so new videos show up within 5 minutes.

**When there's no saved video**, the coach says so and answers normally (`VIDEO_FALLBACK=none`, the default).
Set `VIDEO_FALLBACK=search` to show a "Search YouTube" button instead, or `youtube` (with `YOUTUBE_API_KEY`) to
find one on YouTube.

The coach can only share video links your library returned. Any other video link is removed before the reply
reaches the user.

If you don't have a videos table yet, `supabase/migrations/20260926000000_exercise_videos.sql` creates one.
If your app sets a Content Security Policy, allow `frame-src https://www.youtube-nocookie.com`, or videos won't play.

## Costs and limits

The coach uses the **Claude API**, which is billed separately from any Claude subscription (Pro/Max).
Add credit and set a monthly spend limit at https://platform.claude.com.

- Each message costs roughly **1-3 cents** on the default model (`claude-sonnet-5`), depending on how much
  history and how many log lookups it uses. `claude-haiku-4-5-20251001` is about half that.
- Prompt caching is on, which makes follow-up messages within a few minutes cheaper.
- Per-user limits: `RATE_LIMIT_PER_MIN=6` and `DAILY_MESSAGE_LIMIT=50`. Change them in Vercel.
- The coach sends the last 20 messages with each question (older ones are searchable) and keeps up to
  60 notes per user. See the top of `agent/agent.js` and `agent/memory-supabase.js`.

## Endpoints (POST, JSON, `userToken` = the user's Supabase access token)

| Endpoint | Body | Returns |
|---|---|---|
| `/api/chat` | `{ userToken, message }` | `{ reply }` |
| `/api/history` | `{ userToken }` | last 50 messages |
| `/api/memory` | `{ userToken }` | the coach's notes (for a "What the coach remembers" screen) |
| `/api/memory` | `{ userToken, action: "clear" }` | erases the coach's notes + chat history (not your app's data) |

## Before launch checklist

- [ ] Memory tables created (step 2); table settings match your schema (step 3)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only on Vercel, never in your app's code
- [ ] `ALLOWED_ORIGINS` set to your app's URL
- [ ] Spend limit set in the Claude Console
- [ ] Your app tells users the coach is AI, not medical advice, and that it remembers their chats
- [ ] Privacy policy covers sending profile, workout and chat data to an AI provider, and storing chat history
- [ ] Video settings point at your app's saved videos, and a video plays in the chat inside your app
- [ ] Tested with a real account: progress questions, memory across sessions, injuries, and aggressive diet requests
