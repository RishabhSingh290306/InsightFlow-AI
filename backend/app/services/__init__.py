"""Service layer — business logic that sits between routes and the data layer.

Includes the deterministic profiling service and the AI (OpenRouter) client.
The key architectural rule: deterministic code computes facts; the LLM only
interprets those facts.
"""
