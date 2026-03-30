# Purchase System

A microservices-based purchase system running on Kubernetes.

## Architecture

```
[Frontend (nginx)] → [Customer Facing (Express:3000)] → Kafka → [Customer Management (Express:3001)] → MongoDB
```

- **Frontend**: Static HTML served by nginx, proxies API calls to customer-facing
- **Customer Facing**: Publishes purchases to Kafka, proxies read requests to customer-management
- **Customer Management**: Consumes from Kafka, stores purchases in MongoDB, serves purchase history
- **Kafka**: Message broker (KRaft mode, apache/kafka)
- **MongoDB**: Persistent storage for purchases

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Kubernetes enabled
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Helm](https://helm.sh/docs/intro/install/)

## Deployment Instructions

### 1. Enable Kubernetes in Docker Desktop

Docker Desktop → Settings → Kubernetes → Enable Kubernetes → Apply & Restart

```bash
kubectl config use-context docker-desktop
kubectl get nodes
```

### 2. Build Docker images

```bash
docker build -t customer-facing:latest ./customer-facing
docker build -t customer-management:latest ./customer-management
docker build -t frontend:latest ./frontend
```

### 3. Install KEDA (for Kafka-based autoscaling)

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace
```

### 4. Deploy to Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/mongodb.yaml
kubectl apply -f k8s/kafka.yaml

# Wait for infrastructure
kubectl rollout status deployment/mongodb -n purchase-system --timeout=120s
kubectl rollout status deployment/kafka -n purchase-system --timeout=120s

kubectl apply -f k8s/customer-management.yaml
kubectl apply -f k8s/customer-facing.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/autoscaling.yaml
```

### 5. Wait for pods to be ready

```bash
kubectl get pods -n purchase-system -w
```

### 6. Access the application

```bash
kubectl port-forward svc/frontend 8080:80 -n purchase-system
```

Then open http://localhost:8080 in your browser.

## CI/CD

### GitHub Actions Pipeline

The CI/CD pipeline (`.github/workflows/ci-cd.yaml`) runs on every push to `main`:

1. **Build & Test** — builds Docker images for all services, verifies containers start
2. **Validate Manifests** — runs `kubectl apply --dry-run` on all K8s manifests
3. **Push** — pushes images to GitHub Container Registry (`ghcr.io`)
4. **Deploy** — updates image tags in manifests and validates

### ArgoCD (Continuous Delivery)

ArgoCD watches this repository and automatically syncs K8s manifests to the cluster.

**Install ArgoCD:**

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

**Deploy the ArgoCD Application:**

```bash
kubectl apply -f argocd/application.yaml
```

**Access ArgoCD UI:**

```bash
kubectl port-forward svc/argocd-server -n argocd 9090:443
```

Open https://localhost:9090 (username: `admin`, password from command below):

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

**Verify sync status:**

```bash
kubectl get applications -n argocd
```

## Verifying Services

### Health checks

```bash
kubectl port-forward svc/customer-facing 3000:3000 -n purchase-system &
curl http://localhost:3000/health
```

### Test a purchase

```bash
curl -X POST http://localhost:3000/buy \
  -H "Content-Type: application/json" \
  -d '{"username":"john","userid":"user123","price":29.99}'
```

### Get purchases

```bash
curl http://localhost:3000/getAllUserBuys/user123
```

### Check autoscaling

```bash
kubectl get hpa -n purchase-system
kubectl get scaledobject -n purchase-system
```

## Project Structure

```
customer-facing/         # Express server - API gateway
  src/index.js           # POST /buy, GET /getAllUserBuys/:userId, GET /health
  Dockerfile
customer-management/     # Express server - data service
  src/index.js           # Kafka consumer, GET /purchases/:userId, GET /health
  Dockerfile
frontend/                # nginx serving static HTML
  index.html
  nginx.conf
  Dockerfile
k8s/                     # Kubernetes manifests
  namespace.yaml
  mongodb.yaml
  kafka.yaml
  customer-facing.yaml
  customer-management.yaml
  frontend.yaml
  autoscaling.yaml
argocd/                  # ArgoCD application manifest
  application.yaml
.github/workflows/       # CI/CD pipeline
  ci-cd.yaml
```
