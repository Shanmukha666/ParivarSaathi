import os

# Tests must not depend on a developer's local .env. These are throwaway test-only values.
os.environ.setdefault("JWT_SECRET", "test-only-secret-not-for-production-0123456789")
os.environ.setdefault("DEMO_MODE", "true")
