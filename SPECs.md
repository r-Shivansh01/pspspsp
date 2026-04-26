# SPEC: CI/CD Pipeline for a Books REST API

## Project Overview

Build a production-ready **Node.js REST API** (Books CRUD) with a fully automated **CI/CD pipeline** using GitHub Actions. The pipeline lints, tests, builds a Docker image, and pushes it to Docker Hub on every merge to `main`. The API must be containerized, health-check ready, and deployable on any free cloud platform (Render, Railway, or Fly.io).

This document is a complete, step-by-step build instruction set. Follow every section in order. Do not skip sections. Generate real, working code — not scaffolding or placeholder comments.

---

## Environment

- **Runtime**: GitHub Codespaces (Ubuntu, Node.js 18+ pre-installed)
- **Package manager**: npm
- **Container tool**: Docker (pre-installed in Codespaces)
- **CI/CD**: GitHub Actions (free tier)
- **Registry**: Docker Hub (free tier)
- **Deployment target**: Render.com (free tier — web service from Docker image)
- **All tools used must be free**

---

## Final Project Structure

Generate the project exactly in this structure. Every file listed must be created with complete, working content:

```
books-api/
├── src/
│   ├── app.js               # Express app (no server.listen here)
│   ├── server.js            # Entry point — calls app.listen
│   └── routes/
│       └── books.js         # All /books route handlers
├── tests/
│   └── app.test.js          # Jest + Supertest tests
├── Dockerfile               # Multi-stage production Docker build
├── .dockerignore
├── .eslintrc.json
├── .gitignore
├── package.json
├── README.md
└── .github/
    └── workflows/
        └── ci-cd.yml        # Full GitHub Actions pipeline
```

---

## Step 1 — Initialize the Project

Run these commands in the Codespaces terminal from the workspace root:

```bash
mkdir books-api && cd books-api
npm init -y
npm install express
npm install --save-dev jest supertest eslint nodemon
```

Update `package.json` — replace the `scripts` block with:

```json
"scripts": {
  "start": "node src/server.js",
  "dev": "nodemon src/server.js",
  "test": "jest --forceExit --coverage",
  "lint": "eslint src/ --ext .js"
},
"jest": {
  "testEnvironment": "node",
  "coverageDirectory": "coverage",
  "collectCoverageFrom": ["src/**/*.js"]
}
```

---

## Step 2 — Write the Application Code

### `src/app.js`

This file creates and exports the Express app. It must NOT call `app.listen()` — that is done in `server.js`. This separation is required so tests can import the app without starting the server.

```js
const express = require('express');
const booksRouter = require('./routes/books');

const app = express();

app.use(express.json());

// Health check endpoint — used by Docker, Kubernetes, and Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/books', booksRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
```

### `src/server.js`

```js
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Books API running on port ${PORT}`);
});
```

### `src/routes/books.js`

In-memory store with full CRUD. In production this would connect to a DB, but for this project an in-memory array is intentional and sufficient.

```js
const express = require('express');
const router = express.Router();

let books = [
  { id: 1, title: 'The Pragmatic Programmer', author: 'Hunt & Thomas', year: 1999 },
  { id: 2, title: 'Clean Code', author: 'Robert C. Martin', year: 2008 },
];

let nextId = 3;

// GET /books — list all books
router.get('/', (req, res) => {
  res.status(200).json({ count: books.length, books });
});

// GET /books/:id — get single book
router.get('/:id', (req, res) => {
  const book = books.find(b => b.id === parseInt(req.params.id));
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.status(200).json(book);
});

// POST /books — create a book
router.post('/', (req, res) => {
  const { title, author, year } = req.body;
  if (!title || !author) {
    return res.status(400).json({ error: 'title and author are required' });
  }
  const book = { id: nextId++, title, author, year: year || null };
  books.push(book);
  res.status(201).json(book);
});

// PUT /books/:id — update a book
router.put('/:id', (req, res) => {
  const index = books.findIndex(b => b.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Book not found' });
  books[index] = { ...books[index], ...req.body, id: books[index].id };
  res.status(200).json(books[index]);
});

// DELETE /books/:id — delete a book
router.delete('/:id', (req, res) => {
  const index = books.findIndex(b => b.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Book not found' });
  const deleted = books.splice(index, 1)[0];
  res.status(200).json({ message: 'Book deleted', book: deleted });
});

module.exports = router;
```

---

## Step 3 — Write Tests

### `tests/app.test.js`

Write tests for every route. All tests must pass before any Docker build happens.

```js
const request = require('supertest');
const app = require('../src/app');

describe('Health Check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('Books API — GET', () => {
  it('GET /books returns list with count', async () => {
    const res = await request(app).get('/books');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.books)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });

  it('GET /books/:id returns a single book', async () => {
    const res = await request(app).get('/books/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('GET /books/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/books/9999');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });
});

describe('Books API — POST', () => {
  it('POST /books creates a new book', async () => {
    const res = await request(app)
      .post('/books')
      .send({ title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', year: 2017 });
    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe('Designing Data-Intensive Applications');
    expect(res.body.id).toBeDefined();
  });

  it('POST /books returns 400 when title is missing', async () => {
    const res = await request(app).post('/books').send({ author: 'Unknown' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('Books API — PUT', () => {
  it('PUT /books/:id updates an existing book', async () => {
    const res = await request(app)
      .put('/books/1')
      .send({ title: 'The Pragmatic Programmer (20th Anniversary)' });
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('The Pragmatic Programmer (20th Anniversary)');
  });

  it('PUT /books/:id returns 404 for unknown id', async () => {
    const res = await request(app).put('/books/9999').send({ title: 'Ghost' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Books API — DELETE', () => {
  it('DELETE /books/:id deletes a book', async () => {
    const res = await request(app).delete('/books/2');
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Book deleted');
  });

  it('DELETE /books/:id returns 404 for unknown id', async () => {
    const res = await request(app).delete('/books/9999');
    expect(res.statusCode).toBe(404);
  });
});

describe('Unknown Routes', () => {
  it('returns 404 for undefined routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.statusCode).toBe(404);
  });
});
```

Verify tests pass locally before proceeding:

```bash
npm test
```

All tests must show green. Fix any failures before moving to the next step.

---

## Step 4 — Configure ESLint

### `.eslintrc.json`

```json
{
  "env": {
    "commonjs": true,
    "es2021": true,
    "node": true,
    "jest": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": "latest"
  },
  "rules": {
    "no-console": "off",
    "no-unused-vars": ["error", { "argsIgnorePattern": "^next$" }]
  }
}
```

Verify lint passes:

```bash
npm run lint
```

Fix any lint errors before proceeding. The pipeline will fail if lint fails.

---

## Step 5 — Write the Dockerfile

Use a **multi-stage build** to keep the production image small. The build stage installs all dependencies and the final stage copies only what's needed.

### `Dockerfile`

```dockerfile
# ── Stage 1: Build ────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first to leverage Docker layer caching.
# If package.json hasn't changed, npm ci is skipped on rebuild.
COPY package*.json ./

# npm ci is used instead of npm install because it is:
# - Deterministic (uses package-lock.json exactly)
# - Faster in CI environments
# - Removes node_modules before install for a clean state
RUN npm ci

COPY src/ ./src/

# ── Stage 2: Production ───────────────────────────────────────
FROM node:18-alpine AS production

# Set NODE_ENV to production — disables dev error verbosity
ENV NODE_ENV=production

WORKDIR /app

# Copy only production dependencies from builder
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source from builder stage
COPY --from=builder /app/src ./src

# Create a non-root user for security best practice
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Health check — Docker will mark the container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
```

### `.dockerignore`

```
node_modules
.github
tests
coverage
*.md
.eslintrc.json
.gitignore
```

Build and test the Docker image locally:

```bash
docker build -t books-api:local .
docker run -p 3000:3000 books-api:local
```

In a new terminal:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/books
```

Both must return valid JSON. Stop the container (`Ctrl+C`) and continue.

---

## Step 6 — Create Config Files

### `.gitignore`

```
node_modules/
coverage/
.env
*.log
dist/
```

### `README.md`

```markdown
# Books API

A RESTful API for managing a book collection, built with Node.js and Express.
Fully containerized with Docker and shipped via an automated CI/CD pipeline using GitHub Actions.

## Endpoints

| Method | Route        | Description         |
|--------|--------------|---------------------|
| GET    | /health      | Health check        |
| GET    | /books       | List all books      |
| GET    | /books/:id   | Get book by ID      |
| POST   | /books       | Create a book       |
| PUT    | /books/:id   | Update a book       |
| DELETE | /books/:id   | Delete a book       |

## Run locally

```bash
npm install
npm run dev
```

## Run with Docker

```bash
docker build -t books-api .
docker run -p 3000:3000 books-api
```

## CI/CD Pipeline

Every push to `main`:
1. ESLint checks code quality
2. Jest runs all tests with coverage
3. Docker image is built and pushed to Docker Hub (tagged `latest` + commit SHA)
```
```

---

## Step 7 — GitHub Actions Pipeline

Create the directory and file:

```bash
mkdir -p .github/workflows
touch .github/workflows/ci-cd.yml
```

### `.github/workflows/ci-cd.yml`

```yaml
name: CI/CD Pipeline

# Trigger on push or PR to main branch
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:

  # ── Job 1: Lint and Test ──────────────────────────────────────
  test:
    name: Lint and Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 18
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'        # Caches node_modules between runs for speed

      - name: Install dependencies
        run: npm ci           # Deterministic install from package-lock.json

      - name: Run ESLint
        run: npm run lint

      - name: Run tests with coverage
        run: npm test

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7   # Keep coverage artifact for 7 days

  # ── Job 2: Build and Push Docker Image ───────────────────────
  docker:
    name: Build and Push Docker Image
    runs-on: ubuntu-latest
    needs: test               # This job only starts if the test job passes

    # Only push on actual merges to main — not on pull requests
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        # Buildx enables advanced features: multi-platform builds, layer caching

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          # Two tags: 'latest' for convenience, SHA for traceability and rollback
          tags: |
            ${{ secrets.DOCKERHUB_USERNAME }}/books-api:latest
            ${{ secrets.DOCKERHUB_USERNAME }}/books-api:${{ github.sha }}
          # Cache layers from previous builds to speed up subsequent runs
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## Step 8 — Push to GitHub

If not already a git repo:

```bash
git init
git add .
git commit -m "feat: books API with Docker and CI/CD pipeline"
```

Create a new repository on [github.com](https://github.com) — name it `books-api`. Then:

```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/books-api.git
git branch -M main
git push -u origin main
```

---

## Step 9 — Add GitHub Secrets

These secrets allow the pipeline to push to your Docker Hub account securely. They are never exposed in logs.

1. Go to [hub.docker.com](https://hub.docker.com) → Sign up for a free account if needed
2. Go to **Account Settings → Security → New Access Token** → name it `github-actions` → copy the token
3. Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these two secrets exactly:

| Secret name          | Value                                      |
|----------------------|--------------------------------------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username (e.g. `shivansh`) |
| `DOCKERHUB_TOKEN`    | The access token you just generated        |

---

## Step 10 — Verify the Pipeline

1. Go to your GitHub repo → **Actions** tab
2. You will see a workflow run triggered by your push
3. Click it — you will see two jobs: `Lint and Test` and `Build and Push Docker Image`
4. Both must show a green checkmark
5. Go to [hub.docker.com](https://hub.docker.com) → your repositories → `books-api` must appear with two tags: `latest` and the full commit SHA

If the pipeline is red, click the failing step to read the error log and fix it.

---

## Step 11 — Deploy to Render (Free)

Render can pull your Docker image from Docker Hub and run it as a web service at no cost.

1. Go to [render.com](https://render.com) → Sign up with GitHub (free)
2. Click **New → Web Service**
3. Select **Deploy an existing image from a registry**
4. Image URL: `docker.io/YOUR_DOCKERHUB_USERNAME/books-api:latest`
5. Set:
   - **Name**: `books-api`
   - **Region**: Singapore (closest to India)
   - **Instance type**: Free
   - **Port**: `3000`
6. Under **Environment Variables**, add: `NODE_ENV` = `production`
7. Click **Create Web Service**

Render will pull the Docker image and deploy it. After 2–3 minutes you will get a live URL like `https://books-api-xxxx.onrender.com`.

Test your live deployment:

```bash
curl https://books-api-xxxx.onrender.com/health
curl https://books-api-xxxx.onrender.com/books
```

---

## Automated Re-Deployment on Push (Optional)

To make Render auto-deploy every time GitHub Actions pushes a new image:

1. In Render → your service → **Settings → Deploy Hook** → copy the URL
2. In GitHub repo → **Settings → Secrets → New secret**: `RENDER_DEPLOY_HOOK` = the URL
3. Add this as a new step at the end of the `docker` job in `ci-cd.yml`:

```yaml
      - name: Trigger Render deployment
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"
```

Now the full flow is: push to main → lint → test → Docker push → Render re-deploys automatically.

---

## Verification Checklist

Run through every item before considering the project complete:

- [ ] `npm test` — all tests pass locally
- [ ] `npm run lint` — zero lint errors
- [ ] `docker build -t books-api .` — image builds successfully
- [ ] `docker run -p 3000:3000 books-api` — container starts and `/health` returns 200
- [ ] GitHub Actions — both jobs show green on the Actions tab
- [ ] Docker Hub — image appears with `latest` and SHA tags
- [ ] Render — live URL returns valid JSON from `/health` and `/books`

---

## API Reference

### Request / Response Examples

**GET /books**
```json
{
  "count": 2,
  "books": [
    { "id": 1, "title": "The Pragmatic Programmer", "author": "Hunt & Thomas", "year": 1999 },
    { "id": 2, "title": "Clean Code", "author": "Robert C. Martin", "year": 2008 }
  ]
}
```

**POST /books** — Body: `{ "title": "string", "author": "string", "year": number }`
```json
{ "id": 3, "title": "...", "author": "...", "year": 2024 }
```

**Error responses** always follow: `{ "error": "human-readable message" }`

---

## What to Say in an Interview

> "I built a production-ready Node.js REST API and set up a CI/CD pipeline with GitHub Actions. On every push to main, the pipeline lints the code with ESLint, runs unit and integration tests with Jest and Supertest, and only if both pass, builds a Docker image using a multi-stage build to minimize image size and pushes it to Docker Hub with two tags — `latest` for convenience and a commit SHA tag for traceability and rollback. I used `npm ci` in the pipeline because it's deterministic and faster than `npm install` in CI. The Docker image runs as a non-root user for security and includes a `HEALTHCHECK` instruction so orchestrators like Kubernetes can monitor container health. The app is live on Render, deployed automatically via a deploy hook triggered by the pipeline."

Key concepts to know: `npm ci` vs `npm install`, multi-stage Docker builds, why commit SHA tagging enables rollback, what `needs:` does in GitHub Actions, `HEALTHCHECK` in Docker, non-root container users.
