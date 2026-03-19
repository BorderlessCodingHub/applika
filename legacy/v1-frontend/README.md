# Applika.dev - Frontend

## Project Structure

```
frontend/
├── public/          # Static files
│   └── images/      # Image assets
├── src/
│   ├── app/         # Next.js App Router pages
│   │   ├── (auth)/      # Authentication related pages
│   │   ├── (protected)/ # Protected routes
│   │   └── profile/     # User profile pages
│   ├── components/  # Reusable components
│   │   ├── layout/     # Layout components
│   │   ├── navigation/ # Navigation components
│   │   └── ui/         # UI components
│   ├── config/      # Configuration files
│   ├── domain/      # Domain specific code
│   │   └── constants/  # Constants and enums
│   ├── features/    # Feature-based modules
│   │   ├── applications/
│   │   ├── auth/
│   │   ├── home/
│   │   └── profile/
│   └── lib/         # Library code and utilities
```

## Prerequisites

- Node.js 20 or higher
- pnpm (latest version recommended)

## Environment Setup

1. Create a `.env` file in the root directory:
```env
# Required
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000  # Your API URL
```

## Installation

1. Install dependencies:
```bash
pnpm install
```

2. Run the development server:
```bash
pnpm dev
```

3. Build for production:
```bash
pnpm build
```

4. Run production build:
```bash
pnpm start
```

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Create production build
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

## Docker Compose Support

The project includes Docker compose support. To run using Docker:

```bash
docker compose up --build
```

## Accessing the Application

After starting the development server, the application will be available at:

- [http://127.0.0.1:3000](http://127.0.0.1:3000)

## Development Notes

- The application uses Next.js 15+ with App Router
- TypeScript is used throughout the project
- ESLint and Prettier are configured for code quality
- The project follows a feature-based architecture
- Protected routes are handled in the `(protected)` directory
- Environment variables must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser