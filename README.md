# Purchase System

A microservices-based purchase system running on Kubernetes (minikube).

## Architecture

```
[Frontend (nginx)] → [Customer Facing (Express:3000)] → Kafka → [Customer Management (Express:3001)] → MongoDB
```

- **Frontend**: Static HTML served by nginx, proxies API calls to customer-facing
- **Customer Facing**: Publishes purchases to Kafka, proxies read requests to customer-management
- **Customer Management**: Consumes from Kafka, stores purchases in MongoDB, serves purchase history
- **Kafka + Zookeeper**: Message broker between services
- **MongoDB**: Persistent storage for purchases

## Prerequisites

- [minikube](https://minikube.sigs.k8s.io/docs/start/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Docker](https://docs.docker.com/get-docker/)
- [Helm](https://helm.sh/docs/intro/install/)

## Deployment Instructions

### 1. Start minikube

```bash
minikube start
```

### 2. Use minikube's Docker daemon

```bash
eval $(minikube docker-env)
```

### 3. Build Docker images

```bash
docker build -t customer-facing:latest ./customer-facing
docker build -t customer-management:latest ./customer-management
docker build -t frontend:latest ./frontend
```

### 4. Install KEDA (for Kafka-based autoscaling)

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace
```

### 5. Deploy to Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/mongodb.yaml
kubectl apply -f k8s/kafka.yaml
kubectl apply -f k8s/customer-facing.yaml
kubectl apply -f k8s/customer-management.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/autoscaling.yaml
```

### 6. Wait for pods to be ready

```bash
kubectl get pods -n purchase-system -w
```

### 7. Access the application

```bash
minikube service frontend -n purchase-system
```

Or use port-forwarding:

```bash
kubectl port-forward svc/frontend 8080:80 -n purchase-system
```

Then open http://localhost:8080 in your browser.

## Verifying Services

### Health checks

```bash
kubectl port-forward svc/customer-facing 3000:3000 -n purchase-system &
kubectl port-forward svc/customer-management 3001:3001 -n purchase-system &

curl http://localhost:3000/health
curl http://localhost:3001/health
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
# HPA for customer-facing
kubectl get hpa -n purchase-system

# KEDA ScaledObject for customer-management
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
```
