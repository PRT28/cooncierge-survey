# Mobile Survey SPA

## Setup
1. Create a Supabase project.
2. Create a table `surveys` with columns:
   - `id` uuid (primary key, default `gen_random_uuid()`)
   - `created_at` timestamp with time zone (default `now()`)
   - `data` jsonb
   - `photo_path` text (nullable)
   - `photo_url` text (nullable)
3. Create a storage bucket named `survey-uploads` (public).
4. Copy `.env.example` to `.env` and fill in Supabase credentials.

## Dev
```bash
npm install
npm run dev
```

## Notes
- The photo step uses `capture="environment"` for mobile camera.
- Update Supabase RLS policies to allow insert and update on `surveys`, and upload to `survey-uploads`.
