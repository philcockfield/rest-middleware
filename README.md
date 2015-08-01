# Rest Methods
Isomorphic, promise-based REST services.

[![Build Status](https://travis-ci.org/philcockfield/rest-methods.svg)](https://travis-ci.org/philcockfield/rest-methods)

Rapidly publish a set of javascript functions as a REST endpoint with a simple promise-based RPC style invocation on the client.  Automatically produces rich API documentation.

![Docs](https://cloud.githubusercontent.com/assets/185555/9017617/d41b2bae-382b-11e5-8f7b-95e24e604920.png)




## Install

    npm install --save rest-methods


## Getting Started
See the [example project](https://github.com/philcockfield/rest-methods-example) that contains a working version of everything described in this getting started tutorial.

#### Quick Start
Create and start a new REST web-service with the internal connect server on a default port:
```js
var Service require("rest-methods/server");
var service = Service({ name:'My Service' }).start();

```


#### Create the Server with Options
You may be wanting to expose you REST API as part of a wider application.  Simply pass in your connect-based server as an option at setup.

```js
var express = require("express");
var Service = require("rest-methods/server");

var app = express();
var service = Service({
  name:'My Service',
  version: '1.0.1',
  basePath: '/v1',
  connect: app
}).start({ port:3030 });
```

The example above shows additional configuration options, including your service's `version` and a base path that all REST urls are prefixed with.


## Craft Your API
Your service API is exposed by declaring methods. The following is the simplest kind of method declaration:

```js
service.methods({
  "user": function() {
      console.log(this);
      return { date:new Date() };
  }
});
```

Navigate to the services documentation in your browser ([`http://localhost:3030/v1`](http://localhost:3030/v1)) to see your method documented like so:

![Foo Method](https://cloud.githubusercontent.com/assets/185555/9016885/92f68662-3828-11e5-99f8-5308d6283524.png)

By declaring a single function, each of the HTTP verbs (`GET`, `POST`, `PUT`, `DELETE`) is represented by the single handler.  

Click on the URL (`/v1/user`) to see the `GET` method executed. The example method has a `console.log(this)` showing you which HTTP verb was invoked and details about the URL.


## Modeling the REST API
We can craft the shape of the REST API in the following ways:

- Expose different handlers for each HTTP verb.
- Expose only a subset of HTTP verbs.
- Take parameters.
- Shape the URL with parameters.

For example, below we are crafting a `user` method that takes the ID of the user in the URL and passes it do the `GET/POST/PUT` methods.  We are choosing not to make a `DELETE` method available:

```js
service.methods({
  "user": {
    url: "/users/:id",
    get: function(id) { return { verb:'GET', date:new Date() }; },
    post: function(id, data) { return { verb:'POST', date:new Date(), id:id }; },
    put: function(id, data) { return { verb:'PUT', date:new Date(), id:id }; },
  }
});
```

The URL to this method would look something like this:

    /v1/users/123

...where the `id` parameter is `123` which is passed to the correspondingly named parameters of each of the method's handlers.

#### URL Parameters
Parameters that are baked into the URL are mapped to correspondingly named function parameters.  URL parameters must come before other parameters on your function definition.  

The service will help you out by throwing useful error messages if you declare something that it is not expecting.

URL parameters can also be placed within the query-string, for example:

```js
{
  url: "/books/:year?skip=:skip&take=:take",
  get: function(year, skip, take) { ... }
}
```

#### Documentation
Providing JSDocs style comments makes your published API documentation look amazing.  Often times publishing the API docs for a service is low on the priority list, but is essential for consumers of your service.  With `rest-methods` your API is automatically documenting by default, and by including lightweight method comments you will have a complete documentation story without any extra work on your part.

Add a `docs` field to your method declaration.  It can contain markdown along with `@param {type}` details for each parameter:

```js
service.methods({
  "user": {
    docs: `
    Retrieves and manages the specified user, including:
    - Profile
    - Friends
    - Access history

    @param {string} id: The unique identifier of the user.
    @param {object} data: The user data to update.
    `,
    url: "/users/:id",
    get: function(id) { return { verb:'GET', date:new Date() }; },
    post: function(id, data) { return { verb:'POST', date:new Date(), id:id }; },
    put: function(id, data) { return { verb:'PUT', date:new Date(), id:id }; },
  }
});

```

Produces the following documentation screen:

![Docs](https://cloud.githubusercontent.com/assets/185555/9017617/d41b2bae-382b-11e5-8f7b-95e24e604920.png)


## Invoking Methods (Isomorphic/Promises)
A consistent isomorphic experience if provided for consuming your REST service, making it fast and convenient to invoke REST methods without needing to write and maintain URL wrangling code.

The service can be consumed using a dynamically created client library that provides a consistent promise-based idiom across all relevant call-sites:

- The browser
- A remote server
- The REST service itself.

### Invoking From the Browser
The following sample page references the `browser.js` script and then invokes a method on the server using promises:

```html
<html>
  <script type="text/javascript" src="/v1/browser.js" charset="utf-8"></script>
  <script type="text/javascript" charset="utf-8">
    /*
      Wait for client the service to be ready.
         This is pulling the API manifest from the server and
         constructing the client-method stubs.
    */
    RestService.onReady(function() {

        // Invoke the PUT method on the "users/:id" resource.
        RestService.methods.user.put(123, { name:"Alicia" })
        .then(function(result) {
            console.log("result", result);
        })
        .catch(function(err) {
            console.log("error", err);
        })

    });
  </script>
</html>
```

In the example above the client calls the service to receive the [method manifest](http://localhost:3030/methods.manifest.json) which it uses to create the set of helper functions that call the server-methods over XHR at the correctly formatted URL, returning a promise.

If you were using [WebPack](http://webpack.github.io/) you would not need to reference the `browser.js` script, rather just `require("rest-methods/browser")` within your WebPack build.

#### Method Namespaces
Methods are stored by name on the `.methods` object.  You can introduce the concept of namespacing by using a `/` within your method names, for example:

```js
// On the server:
service.methods({
  "auth/users": () => {}
  "auth/groups/roles": (name, userId) => {}
});

// On the client:
RestService.methods.auth.users.get()
.then(function(result){ ... });

RestService.methods.auth.groups.roles.put("admin", 1234)
.then(function(result){ ... });
```



### Invoking from a Remote Server
To invoke from another server, simply pass the host to connect with.  Because this is isomorphic, from there on the programming idiom is identical to the browser:

```js
var RestService = require("rest-methods/client");
var service = RestService({ host:"localhost:3030" });

service.onReady(function() {

    // Invoke the PUT method on the "users/:id" resource.
    service.methods.user.put(123, { name:"Alicia" })
    .then(function(result) {
      console.log("result", result);
    });

});
```



### Invoking From The Service Itself
And again, invoking methods from the service itself is identical to how it's done on a remote client.  This allows you to write shared code between the client and server that uses the consistent promise-based method stubs.

```js
// Declaring the service API.
service.methods({
  "foo/bar": (data) => { ... }
});

// Invoking a method locally within your server module.
service.methods.foo.bar.put({ stuff:123 })
.then((result) => { ... })
.catch((err) => { ... });

```

## Throwing Errors
Throwing elegant and helpful errors is easy.  Within your service method use the `this.throw()` helper:

```js
// On the server.
service.methods({
  "foo": (id) => {
    this.throw(404, `A foo with the id '${ id }' does not exist.`);
  }
});

// On the client.
service.methods.foo.get(123)
.catch((err) => {
  // Error contains status-code, method-name and message.
})


```

This causes a rich `ServerMethodError` to be passed back to the client's `catch` callback containing your HTTP status-code, your error message as well as details about the method that threw the error.  Very helpful when debugging.


--------

## Test
    npm test
    npm run tdd  # Watch



## Development

    gulp build
    nodemon ./example -e js,jsx,styl



## Credit
Conceptually based on Meteor's server methods pattern.



## License (MIT)
Copyright © 2015, **Phil Cockfield**

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
