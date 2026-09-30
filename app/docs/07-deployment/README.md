# Deployment

How the console is built, configured and shipped: one Docker image, the same
for every deployment, configured by environment variables when the container
starts.

- [Docker](./docker.md): build and run the image, what nginx serves, and what
  the image does not include.
- [Environment variables](./environments.md): every variable the app reads,
  and which ones a container can change.
- [CI/CD](./ci-cd.md): the workflows that check the app, run the end-to-end
  suites and publish the image.
