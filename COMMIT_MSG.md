feat(posts, profiles): provider posts flow, public user profiles, and navigation links

Backend (API):
- posts:
  - Add GET /posts/:id to fetch single post with author info (apps/api/src/routes/posts.ts)
  - Ensure existing POST /posts and GET /posts return author names as before
- users:
  - Add GET /users/:id to fetch public user profile with:
    - Basic info (id, name, email, roles, createdAt)
    - Stats (postsCount, firstPostAt)
    - Placeholders for successfulSalesCount, averageRating, reviews
  - Wire registerUserRoutes(app) in API bootstrap (apps/api/src/index.ts)

Frontend (Web):
- API client (apps/web/lib/api.ts):
  - Add PostDTO, PostDetailDTO, and API methods: createPost(), listPosts(), getPost(id)
  - Add UserProfileDTO and API method: getUserProfile(id)
- Home page (apps/web/app/page.tsx):
  - Fetch posts from API
  - Group and render by mode (Virtual/Physical)
  - Link post cards to detail pages
- Provider posts:
  - Create provider-only post creation page at /provider/posts with role guards and form (apps/web/app/provider/posts/page.tsx)
  - Add "My Posts" page at /provider/posts/mine to list the current user's posts with links (apps/web/app/provider/posts/mine/page.tsx)
  - After successful creation, redirect to My Posts from both entry points:
    - Provider posts page (apps/web/app/provider/posts/page.tsx)
    - Provider settings page (apps/web/app/provider/page.tsx)
- Post details (apps/web/app/posts/[id]/page.tsx):
  - Create detail page rendering full post info and author
  - Replace inline author details with a "View Profile" link to /users/[id]
  - Fix imports and remove non-existent Button import; use styled Link
- User profile page:
  - Create public profile page at /users/[id] showing:
    - Account info (name, email, joined date, roles)
    - Activity stats (posts count, first post date, successful sales placeholder)
    - Reviews list and average rating (placeholders)
  - File: apps/web/app/users/[id]/page.tsx
- Navigation:
  - Add “My Posts” link in header for authenticated users (apps/web/components/header.tsx)
  - Add quick-access link to post creation from provider settings header (apps/web/app/provider/page.tsx)

Security / Access:
- Enforce provider role on post creation (frontend guards, backend already enforces)
- Keep listing posts and user profiles public

Notes:
- Uses NEXT_PUBLIC_API_URL for frontend API base URL
- Sales/reviews remain placeholders pending model implementation

Files touched (high level):
- API: apps/api/src/index.ts, apps/api/src/routes/posts.ts, apps/api/src/routes/users.ts
- Web API client: apps/web/lib/api.ts
- Web pages: 
  - apps/web/app/page.tsx
  - apps/web/app/posts/[id]/page.tsx
  - apps/web/app/provider/posts/page.tsx
  - apps/web/app/provider/posts/mine/page.tsx
  - apps/web/app/provider/page.tsx
  - apps/web/app/users/[id]/page.tsx
- UI: apps/web/components/header.tsx

Result:
- Providers can create posts and land on “My Posts”
- Users can browse posts, open details, and navigate to public user profiles
- Public user profiles expose account and activity info with placeholders for future sales/reviews
