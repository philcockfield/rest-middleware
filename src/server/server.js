import _ from "lodash";
import Promise from "bluebird";
import ServerMethod from "./ServerMethod";
import middleware from "./middleware";
import connect from "connect";
import pageJS from "../page-js";
import { METHODS, HANDLERS, INVOKE } from "../const";
import { ServerMethodError } from "../errors";
import http from "http";
import * as util from "js-util";
import { getMethodUrl } from "../url";



/**
* Generates a standard URL for a method.
*
* @param basePath:  The base path to prefix the URL with.
* @param path:      The main part of the URL.
*
* @return string.
*/
const methodUrl = (basePath, path) => {
  path = path.replace(/^\/*/, "");
  let url = `${ basePath }/${ path }`;
  url = "/" + url.replace(/^\/*/, "");
  return url;
};



/**
  * Represents a REST API server.
  */
class Server {
  /**
    * Constructor
    *
    * @param connect: The connect app to apply the middleware to.
    * @param options:
    *           - name:     The name of the service.
    *           - basePath: The base path to prepend URL"s with.
    *           - version:  The version number of the service.
    *           - docs:     Flag indicating if generated docs should be serverd.
    *                       Default: true.
    */
  constructor(options = {}) {
    // Store state.
    const self = this;
    this.name = options.name || "Server Methods";
    this.version = options.version || "0.0.0";
    this.docs = _.isBoolean(options.docs) ? options.docs : true;
    this.middleware = middleware(this);

    // Private state.
    this[METHODS] = {};
    this[HANDLERS] = {
      before: new util.Handlers(),
      after: new util.Handlers()
    };

    // Store base path.
    let path = options.basePath;
    if (_.isString(path)) {
      path = path.replace(/^\/*/, "").replace(/\/*$/, "");
    } else {
      path = "";
    }
    this.basePath = `/${ path }`;

    /**
    * Registers or retrieves the complete set of methods.
    *
    * @param definition: An object containing the method definitions.
    * @return an object containing the set of method definitions.
    */
    this.methods = (definition) => {
      // Write: store method definitions if passed.
      if (definition) {
        const createUrl = (urlPath, methodDef) => {
            return methodUrl(this.basePath, (methodDef.url || urlPath));
        };

        Object.keys(definition).forEach((key) => {
            let methods = this[METHODS];
            if (methods[key]) { throw new Error(`Method "${ key }" already exists.`); }

            let value = definition[key];
            let url = createUrl(key, value);
            let methodSet;
            if (_.isFunction(value)) {
              // A single function was provided.
              // Use it for all the HTTP verbs.
              let func = value;
              methodSet = {
                get: new ServerMethod(key, func, url, "GET"),
                put: new ServerMethod(key, func, url, "PUT"),
                post: new ServerMethod(key, func, url, "POST"),
                delete: new ServerMethod(key, func, url, "DELETE")
              };

            } else if(_.isObject(value)) {
              // Create individual methods for each verb.
              methodSet = {};
              if (value.get) { methodSet.get = new ServerMethod(key, value.get, url, "GET", value.docs); }
              if (value.put) { methodSet.put = new ServerMethod(key, value.put, url, "PUT", value.docs); }
              if (value.post) { methodSet.post = new ServerMethod(key, value.post, url, "POST", value.docs); }
              if (value.delete) { methodSet.delete = new ServerMethod(key, value.delete, url, "DELETE", value.docs); }

            } else {
              throw new Error(`Type of value for method "${ key }" not supported. Must be function or object.`);
            }

            // Store an pointer to the method.
            // NOTE:  This allows the server and client to behave isomorphically.
            //        Server code can call the methods (directly) using the same
            //        pathing/namespace object that the client uses, for example:
            //
            //              server.methods.foo.put(123, "hello");
            //
            let stub = util.ns(this.methods, key, { delimiter: "/" });
            ["get", "put", "post", "delete"].forEach((verb) => {
                    const method = methodSet[verb];
                    if (method) {
                      stub[verb] = function(...args) {

                        // Prepare the URL for the method.
                        const route = method.route;
                        const totalUrlParams = route.keys.length;
                        const invokeUrl = getMethodUrl(method.name, null, route, args);
                        if (totalUrlParams > 0) {
                          args = _.clone(args);
                          args.splice(0, totalUrlParams);
                        }

                        // Invoke the method.
                        return self[INVOKE](method, args, invokeUrl);
                      };
                    }
            });

            // Store the values.
            this[METHODS][key] = methodSet;
        });
      }
      // Read.
      return this[METHODS];
    };

    // Finish up (Constructor).
    return this;
  }


  /**
   * Determines whether the given URL path matches any of
   * the method routes.
   * @param url:  {string} The URL path to match.
   * @param verb: {string} The HTTP verb to match (GET|PUT|POST|DELETE).
   * @return {ServerMethod}
   */
  match(url, verb) {
    verb = verb.toLowerCase();
    const context = new pageJS.Context(url);
    const methods = this[METHODS];
    const methodNames = Object.keys(methods);
    if (!_.isEmpty(methodNames)) {
      let methodName = _.find(Object.keys(methods), (key) => {
          let methodVerb = methods[key][verb];
          let isMatch = (methodVerb && methodVerb.pathRoute.match(context.path, context.params));
          return isMatch;
      });
      var method = methods[methodName];
    }
    return method ? method[verb] : undefined;
  }


  /**
   * Registers a handler to invoke BEFORE a server method is invoked.
   * @param {Function} func(e): The function to invoke.
   */
  before(func) {
    this[HANDLERS].before.push(func);
    return this;
  }

  /**
   * Registers a handler to invoke AFTER a server method is invoked.
   * @param {Function} func(e): The function to invoke.
   */
  after(func) {
    this[HANDLERS].after.push(func);
    return this;
  }



  /**
   * Private: Invokes the specified method with BEFORE/AFTER handlers.
   */
  [INVOKE](method, args = [], url) {
    return new Promise((resolve, reject) => {
      const startedAt = new Date();
      const beforeArgs = {
        args,
        url,
        verb: method.verb,
        name: method.name,
        throw: (status, message) => {
          throw new ServerMethodError(status, method.name, args, message);
        }
      };

      // BEFORE/AFTER handlers.
      const invokeHandlers = (handlers, e) => {
            handlers.context = e;
            handlers.invoke(e);
          };
      const invokeAfterHandlers = (err, result) => {
            const afterArgs = _.clone(beforeArgs);
            afterArgs.result = result;
            afterArgs.error = err;
            afterArgs.msecs = new Date() - startedAt;
            delete afterArgs.throw; // Cannot throw after the method has been invoked.
            invokeHandlers(this[HANDLERS].after, afterArgs);
          };
      invokeHandlers(this[HANDLERS].before, beforeArgs);

      // Pass execution to the method.
      method.invoke(args, url)
      .then((result) => {
          resolve(result);
          invokeAfterHandlers(undefined, result);
      })
      .catch((err) => {
          reject(err);
          invokeAfterHandlers(err, undefined);
      });
    });
  }



  /**
    * Starts the server.
    * Only use this if you"re not passing in a connect server that
    * you are otherwise starting/managing independely for other purposes.
    * @param options:
    *             - port:     The HTTP port to use.
    *             - silent:   Flag indicating if logging should be suppressed.
    *                         Default: false
    *
    * @return
    */
  start(options = {}) {
    const PORT = options.port || 3030;
    const SILENT = options.silent || false;

    // Start the server.
    const app = connect().use(this.middleware);
    http.createServer(app).listen(PORT);

    // Output some helpful details to the console.
    if (SILENT !== true) {
      const HR = _.repeat("-", 80);
      let ADDRESS = `localhost:${ PORT }`;
      if (!this.basePath !== "/") { ADDRESS += this.basePath; }
      console.log("");
      console.log(HR);
      console.log(" Started:    ", this.name);
      console.log(" - version:  ", this.version);
      console.log(" - address:  ", ADDRESS);
      console.log(HR);
      console.log("");
    }

    // Finish up.
    return this;
  }
}


// ----------------------------------------------------------------------------
export default (options) => { return new Server(options); };
