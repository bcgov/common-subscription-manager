# This Directory contains the load test scripts for the project.
## The scripts are written in JS and use the k6 framework. [k6](https://k6.io)

1.  Only the frontend is load-tested so far. The template's backend test exercised its `users` sample, which has been removed; a backend test belongs with the first real endpoints, run through the API gateway.
2. The tests are run using GitHub Actions.

# Please inform platform services team if you would do a HUGE load TEST on OpenShift platform as it impacts the platform performance.
```
