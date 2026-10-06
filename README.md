# LatestNews

A blog you can run on your computer. Visitors read published posts. Authors and admins sign in, and the dashboard stores posts, topics, users, and contact messages in a SQLite database.

## Run it

Requirements: Node.js 22 or newer.

```bash
cd blog-website
npm install
npm start
```

Open http://localhost:8080

## Demo login

The first launch creates an admin account:

- Username: `admin`
- Password: `LatestNews1!`

Change that password from **Manage Users** before you share the site. New sign-ups become authors. Authors can write and publish their own posts. Only an admin can manage users, topics, and contact messages.

The database file is created at `blog-website/data/blog.sqlite`. It is not committed. Delete that file if you want the demo posts and admin account to be created again.
