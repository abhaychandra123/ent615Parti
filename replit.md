# ClassParticipate

## Overview

ClassParticipate is a real-time classroom participation tracking application designed for professors and students. The app allows students to "raise their hand" digitally during class sessions, while professors/TAs can view a live queue of participating students, assign participation points, and provide feedback. The system tracks participation history and allows students to view their accumulated points over the semester.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state, React Context for auth and WebSocket state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration via CSS variables
- **Build Tool**: Vite with path aliases (@/ for client/src, @shared for shared)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints under /api prefix
- **Real-time Communication**: WebSocket server (ws library) for live participation updates
- **Authentication**: Passport.js with local strategy, session-based auth using express-session
- **Password Security**: scrypt hashing with timing-safe comparison

### Data Storage
- **Database**: PostgreSQL (via @neondatabase/serverless for Neon compatibility)
- **ORM**: Drizzle ORM with Zod validation schemas (drizzle-zod)
- **Session Storage**: connect-pg-simple for PostgreSQL-backed sessions
- **Schema Location**: shared/schema.ts (shared between frontend and backend)
- **Migrations**: Drizzle Kit with migrations output to ./migrations

### Key Design Decisions

1. **Monorepo Structure**: Client, server, and shared code in single repository with TypeScript path aliases for clean imports

2. **Shared Schema**: Database schema and Zod validation schemas defined once in shared/schema.ts, used by both frontend (for type safety) and backend (for validation and ORM)

3. **Single Course Model**: Application uses a hardcoded DEFAULT_COURSE constant rather than multi-course support, simplifying the initial implementation

4. **Role-based Access**: Two user roles (admin/student) with middleware guards (ensureAuthenticated, ensureAdmin) protecting API routes

5. **Storage Abstraction**: IStorage interface allows swapping between MemStorage (development) and DatabaseStorage (production) implementations

6. **Real-time Updates**: WebSocket connection established on user login, enabling live updates for raised hands and participation acknowledgments

## External Dependencies

### Database
- **PostgreSQL**: Primary database accessed via DATABASE_URL environment variable
- **Neon Serverless**: Uses @neondatabase/serverless driver for serverless PostgreSQL connections

### Authentication & Sessions
- **express-session**: Session management
- **connect-pg-simple**: PostgreSQL session store
- **passport / passport-local**: Authentication middleware

### UI Framework
- **Radix UI**: Headless UI primitives (dialogs, dropdowns, tabs, etc.)
- **shadcn/ui**: Pre-built component library
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library

### Build & Development
- **Vite**: Frontend build tool with HMR
- **esbuild**: Server bundling for production
- **Drizzle Kit**: Database migrations and schema management
- **@replit/vite-plugin-shadcn-theme-json**: Theme configuration from theme.json

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string (required)
- `SESSION_SECRET`: Session encryption key (optional, has fallback)