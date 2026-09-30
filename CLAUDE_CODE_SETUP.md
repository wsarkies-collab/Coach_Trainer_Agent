# Setting up the coach with Claude Code

Claude Code can read your app's code and Supabase schema, so it's the quickest way to wire this in.

1. Put this `trainer-agent` folder next to your app's repo (not inside it). It deploys as its own
   Vercel project.
2. Open Claude Code in your **app's** repo and paste the prompt below. Replace the path on the first line.

---

```
I have an AI personal-trainer service in ../trainer-agent (read its README.md first). It's a separate
Vercel project that reads my app's Supabase data and adds a chat bubble to my app. Please:

1. Look at my Supabase schema (migrations, types, or the queries in this repo) and find:
   - the table holding each user's profile (experience level, goals, injuries, etc.) and the column
     with the auth user id
   - the table(s) holding logged workouts, the user id column, the date column, and how
     exercises/sets are stored (same row, JSON column, or child tables)
   Tell me what you found, then write the matching values for PROFILE_TABLE, PROFILE_USER_COLUMN,
   WORKOUTS_TABLE, WORKOUTS_USER_COLUMN, WORKOUTS_DATE_COLUMN and WORKOUTS_SELECT into
   ../trainer-agent/.env (copy from .env.example). If my schema needs more than those settings,
   edit ../trainer-agent/agent/appData.js instead. Keep it read-only.

2. Check how my app stores experience level. If it isn't a field called experienceLevel with values
   beginner / intermediate / advanced, update LEVEL_STYLE and the line that reads the level in
   ../trainer-agent/agent/systemPrompt.js to match.

3. In ../trainer-agent/agent/systemPrompt.js, in the "What the app does" section, use the names my
   app actually uses for its programs and workout logging screens so the coach can point users there.

4. Add the widget to my app: load the widget script once in the root layout, and call
   TrainerAgent.setTokenProvider(...) with my existing Supabase client and TrainerAgent.signOut()
   on sign-out, as shown in the README's step 5. Use an env var for the coach's URL.

5. My app already has a collection of saved exercise videos (YouTube). Find where they're stored
   (a table, a column on my exercises table, or JSON) and set EXERCISE_VIDEOS_TABLE,
   EXERCISE_VIDEOS_NAME_COLUMN, EXERCISE_VIDEOS_URL_COLUMN, and if they exist
   EXERCISE_VIDEOS_TITLE_COLUMN and EXERCISE_VIDEOS_ALIASES_COLUMN in ../trainer-agent/.env.
   If they're stored some other way (e.g. a join table or a JSON column), adapt loadLibrary()/mapRow()
   in ../trainer-agent/agent/videos.js so it returns { exercise, aliases, title, url }.
   Show me 5 example rows and the exercise names users are most likely to ask about, and suggest
   aliases I should add (e.g. "RDL" for Romanian deadlift).
   If my app has a Content Security Policy, allow frame-src https://www.youtube-nocookie.com.

6. Don't put the Supabase service role key anywhere in this app's code. It only goes in the
   trainer-agent Vercel project's environment variables.

Then list what I still need to do by hand (running the SQL migration, Vercel env vars, deploying).
```
