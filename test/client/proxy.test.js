import { expect } from 'chai';
import util from 'js-util';
import { xhr } from 'js-util';
import { FakeXMLHttpRequest } from 'sinon';
import proxy from '../../src/client/proxy';
import { init } from '../../src/client/proxy';
import { registerMethods, state } from '../../src/client/proxy';
import MethodProxy from '../../src/client/MethodProxy';


describe('Proxy (Client)', () => {
  beforeEach(() => {
    proxy.reset()
  });


  it('is not ready upon creation', () => {
    expect(proxy.isReady).to.equal(false);
  });



  describe('[onReady] callbacks', () => {
    it('invokes callbacks when methods are registered', () => {
      let count = 0;
      proxy.onReady(() => count += 1);
      registerMethods({ 'foo': {} });
      expect(count).to.equal(1);
      expect(proxy.isReady).to.equal(true);
    });


    it('invokes callbacks immediately if already [isReady === true]', () => {
      proxy.isReady = true;
      let count = 0;
      proxy.onReady(() => count += 1);
      expect(count).to.equal(1);
    });
  });


  it('stores methods in state', () => {
    registerMethods({
      'foo': { params:[] },
      'foo/bar': {params:['p1']}
    });
    expect(state.methods['foo']).to.be.an.instanceof(MethodProxy);
    expect(state.methods['foo/bar']).to.be.an.instanceof(MethodProxy);
  });


  describe('invokes via [call] and [apply]', () => {
    let method, invoked;
    beforeEach(() => {
      invoked = { count: 0 };
      registerMethods({ foo: { params:[] } });
      method = state.methods['foo'];
      method.invoke = (args) => {
        invoked.count += 1;
        invoked.args = args
      };
    });

    describe('[.call] method', () => {
      it('without parameters', () => {
        proxy.call('foo');
        expect(invoked.count).to.equal(1);
        expect(invoked.args).to.eql([]);
      });

      it('with parameters', () => {
        proxy.call('foo', 1, 2, 3);
        expect(invoked.count).to.equal(1);
        expect(invoked.args).to.eql([1, 2, 3]);
      });

      it('throws if the method does not exist', () => {
        let fn = () => { proxy.call('not-exist'); };
        expect(fn).to.throw(/Method 'not-exist' does not exist./);
      });
    });


    describe('[.apply] method', () => {
      it('without parameters', () => {
        proxy.apply('foo');
        expect(invoked.count).to.equal(1);
        expect(invoked.args).to.eql([]);
      });

      it('with parameter array', () => {
        proxy.apply('foo', [1, 2, 3]);
        expect(invoked.count).to.equal(1);
        expect(invoked.args).to.eql([1, 2, 3]);
      });

      it('with parameter converted to array (edge-case)', () => {
        proxy.apply('foo', 1, 2, 3);
        expect(invoked.count).to.equal(1);
        expect(invoked.args).to.eql([1]);
      });

      it('throws if the method does not exist', () => {
        let fn = () => { proxy.apply('not-exist'); };
        expect(fn).to.throw(/Method 'not-exist' does not exist./);
      });
    });


    describe('queueing invoked calls prior to being ready', () => {
      let fakeXhr;
      beforeEach(() => {
        proxy.reset();
        expect(proxy.isReady).to.equal(false);
        expect(state.queue).to.eql([]);

        xhr.createXhr = () => {
            fakeXhr = new FakeXMLHttpRequest();
            return fakeXhr;
        };
      });


      it('adds a `.call()` to the queue and returns a promise', () => {
        let promise = proxy.call('foo', 1, 2, 3);
        expect(state.queue[0].methodName).to.equal('foo');
        expect(state.queue[0].args).to.eql([1, 2, 3]);
        expect(promise.then).to.be.an.instanceof(Function);
      });


      it('adds an `.apply()` to the queue and returns a promise', () => {
        let promise = proxy.apply('foo', [1, 2, 3]);
        expect(state.queue[0].methodName).to.equal('foo');
        expect(state.queue[0].args).to.eql([1, 2, 3]);
        expect(promise.then).to.be.an.instanceof(Function);
      });


      it('invokes the queued method when ready', (done) => {
        proxy.call('foo', 1, 2)
        .then((result) => {
            expect(result).to.eql({ number:123 });
            done()
        });
        registerMethods({ foo:{ params:[] } });
        fakeXhr.responseText = JSON.stringify({ number:123 });
        fakeXhr.status = 200;
        fakeXhr.readyState = 4;
        fakeXhr.onreadystatechange();
      });


      it('empties the queue', () => {
        proxy.call('foo', 1, 2);
        expect(state.queue.length).to.equal(1);
        registerMethods({ foo:{ params:[] } });
        expect(state.queue.length).to.equal(0);
      });


      it('throws when a queued method does not exist', () => {
        proxy.call('not-exist', 1, 2);
        let fn = () => {
          registerMethods({ foo:{ params:[] } });
        };
        expect(fn).to.throw();
      });
    });
  });
});