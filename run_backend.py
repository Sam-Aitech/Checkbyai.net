#!/usr/bin/env python3

import uvicorn

if __name__ == "__main__":
    # Run the FastAPI application.
    #
    # app_dir="backend" puts backend/ itself on sys.path so main.py's flat
    # imports (from cos_verifier import ...) resolve exactly like they do
    # when uvicorn is launched from inside backend/. Importing
    # "backend.main:app" instead would break those imports.
    uvicorn.run(
        "main:app",
        app_dir="backend",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
