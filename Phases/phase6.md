# 6️⃣ Decomposed Phase 6: Deployment and Optimization

This phase ensures the system is stable and continuously improving.

## 6.1.1 Dockerization of Services
- **Purpose**: Ensure environment consistency across servers.
- **Detailed Steps**: Write Dockerfile and docker-compose.yml for the NLP, Graph, and API services.
- **Tools/Technologies**: `Docker`
- **Expected Output**: Containerized versions of all backend services.

## 6.1.2 GitHub Actions CI Pipeline
- **Purpose**: Automate testing and building.
- **Detailed Steps**: Create a workflow that runs unit tests and builds Docker images on every push to the develop branch.
- **Tools/Technologies**: `GitHub Actions`
- **Expected Output**: Automated build status on GitHub.

## 6.2.1 JWT Authentication Implementation
- **Purpose**: Secure the application and user data.
- **Detailed Steps**: Implement JSON Web Token (JWT) logic on the API Gateway to protect the user's private roadmap.
- **Tools/Technologies**: `FastAPI`, `PyJWT`
- **Expected Output**: Secured endpoints requiring a valid login token.

## 6.2.2 Monitoring & Alerting Setup
- **Purpose**: Track system performance in production.
- **Detailed Steps**: Deploy Grafana and Prometheus to monitor API response times and Graph DB query latency.
- **Tools/Technologies**: `Grafana`, `Prometheus`
- **Expected Output**: Real-time monitoring dashboard for system health.

## 6.3.1 Completion Webhook Listener
- **Purpose**: Trigger the feedback loop.
- **Detailed Steps**: Create an endpoint that receives a "Task Completed" event and updates the user's current skill vector in SQL.
- **Tools/Technologies**: `Python`, `FastAPI`
- **Expected Output**: Updated user profile upon milestone completion.

## 6.3.2 Dynamic Path Recalculation
- **Purpose**: Keep the roadmap adaptive.
- **Detailed Steps**: Implement the logic to automatically re-call the Pathfinder API whenever the user's skill vector changes.
- **Tools/Technologies**: `Python`, `React`
- **Expected Output**: Live roadmap updates on the frontend dashboard.

## Completion Checklist

- [ ] 6.1.1 Dockerization of Services
- [ ] 6.1.2 GitHub Actions CI Pipeline
- [ ] 6.2.1 JWT Authentication Implementation
- [ ] 6.2.2 Monitoring & Alerting Setup
- [ ] 6.3.1 Completion Webhook Listener
- [ ] 6.3.2 Dynamic Path Recalculation
