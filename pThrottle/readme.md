# p-throttle

> Throttle promise-returning & async functions

Copied from [p-throttle]('https://github.com/sindresorhus/p-throttle') for use with commonjs modules. Full README is available there or on [NPM](https://www.npmjs.com/package/p-throttle).

To verify throttling is being applied, you can add a log to the `onDelay` option of the pThrottle configuration:

```
const throttle = pThrottle({
	limit: 2, // number of requests
	interval: 1000, // time interval for limit
  	// a, b as args from the function being throttled
	onDelay: (a, b) => {
		console.log(`Reached interval limit, call is delayed for ${a} ${b}`);
	},
})
```

> **Note:** This code was copied from Github (as of 24/10/03), so it is not necessarily up to date with the original source library.
