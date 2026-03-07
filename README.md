# BizlyCRM

A lightweight, responsive CRM system built with Next.js, Prisma, and PostgreSQL.

## Features

- **Custom Tables**: Create tables with dynamic schemas (JSON based).
- **Record Management**: Add, view, and delete records.
- **Bulk Actions**: Select multiple records and delete them in bulk.
- **Responsive Design**: Works on desktop and mobile.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Styling**: Tailwind CSS

## Getting Started

### 1. Prerequisites

- Node.js installed
- PostgreSQL database running

### 2. Setup

1.  Install dependencies:

    ```bash
    npm install
    ```

2.  Configure Environment Variables:
    Create a `.env` file in the root directory and add your database connection string:

    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
    ```

3.  Initialize Database:
    Run the Prisma migration to create the tables in your database:

    ```bash
    npx prisma migrate dev --name init
    ```

4.  Run the Application:

    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1.  **Create a Table**: Go to `/tables/new` to define a new table structure using JSON schema.
    Example Schema:
    ```json
    [
      { "name": "title", "type": "text", "label": "Title" },
      {
        "name": "status",
        "type": "select",
        "options": ["Open", "Closed"],
        "label": "Status"
      }
    ]
    ```
2.  **Add Records**: Navigate to the created table and use the "Add Record" button.
3.  **Manage Records**: Select records using checkboxes to perform bulk actions.
