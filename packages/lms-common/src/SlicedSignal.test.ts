import "."; // Import order

import { LazySignal, makeSetterWithPatches, NotAvailable, Setter } from ".";
import { Signal } from "./Signal";
import { makeSlicedSignalFrom, pathRelationship } from "./SlicedSignal";

describe("pathRelationship", () => {
  it("should return ancestor", () => {
    const relationship = pathRelationship(["first", "second"], ["first", "second", "third"]);
    expect(relationship).toBe("ancestor");
  });
  it("should return children", () => {
    const relationship = pathRelationship(["first", "second", "third"], ["first", "second"]);
    expect(relationship).toBe("children");
    const relationship2 = pathRelationship(["first", "second"], ["first", "second"]);
    expect(relationship2).toBe("children");
  });
  it("should return neither", () => {
    const relationship = pathRelationship(["first", "second"], ["first", "third"]);
    expect(relationship).toBe("neither");
    const relationship2 = pathRelationship(["first", "weird"], ["first", "second", "third"]);
    expect(relationship2).toBe("neither");
  });
});

describe("SlicedSignal", () => {
  it("should be able to read with regular signal", () => {
    const [sourceSignal, setSource] = Signal.create({ a: { b: { c: 1 } } });
    const [slicedSignal, _setSliced] = makeSlicedSignalFrom([sourceSignal, setSource])
      .access("a")
      .access("b")
      .done();

    expect(slicedSignal.get()).toEqual({ c: 1 });
  });

  it("should be able to subscribe with regular signal", () => {
    const [sourceSignal, setSource] = Signal.create({ a: { b: { c: 1 } }, d: 5 });
    const [slicedSignal, _setSliced] = makeSlicedSignalFrom([sourceSignal, setSource])
      .access("a")
      .access("b")
      .done();

    const subscriber = jest.fn();
    const fullSubscriber = jest.fn();
    slicedSignal.subscribe(subscriber);
    slicedSignal.subscribeFull(fullSubscriber);

    expect(subscriber).not.toHaveBeenCalled();
    expect(fullSubscriber).not.toHaveBeenCalled();

    setSource.withProducer(draft => {
      draft.a.b.c = 2;
    });

    expect(subscriber).toHaveBeenCalledWith({ c: 2 });
    expect(fullSubscriber).toHaveBeenCalledWith(
      { c: 2 },
      [
        {
          op: "replace",
          path: ["c"],
          value: 2,
        },
      ],
      [],
    );

    setSource.withProducer(draft => {
      draft.a.b = { c: 3 };
    });

    expect(subscriber).toHaveBeenCalledWith({ c: 3 });
    expect(fullSubscriber).toHaveBeenCalledWith(
      { c: 3 },
      [
        {
          op: "replace",
          path: [],
          value: { c: 3 },
        },
      ],
      [],
    );

    setSource.withProducer(draft => {
      draft.a = { b: { c: 4 } };
    });

    expect(subscriber).toHaveBeenCalledWith({ c: 4 });
    expect(fullSubscriber).toHaveBeenCalledWith(
      { c: 4 },
      [
        {
          op: "replace",
          path: [],
          value: { c: 4 },
        },
      ],
      [],
    );

    expect(subscriber).toHaveBeenCalledTimes(3);
    expect(fullSubscriber).toHaveBeenCalledTimes(3);

    setSource.withProducer(draft => {
      draft.d = 6;
    });

    expect(subscriber).toHaveBeenCalledTimes(3);
    expect(fullSubscriber).toHaveBeenCalledTimes(3);
  });

  it("should be able to set regular signal", () => {
    const [sourceSignal, setSource] = Signal.create({ a: { b: { c: 1 } } });
    const [_slicedSignal, setSliced] = makeSlicedSignalFrom([sourceSignal, setSource])
      .access("a")
      .access("b")
      .done();

    setSliced({ c: 2 });

    expect(sourceSignal.get()).toEqual({ a: { b: { c: 2 } } });

    setSliced.withProducer(draft => {
      draft.c = 3;
    });

    expect(sourceSignal.get()).toEqual({ a: { b: { c: 3 } } });
  });

  it("should be able to trigger subscription with regular signal", () => {
    const [sourceSignal, setSource] = Signal.create({ a: { b: { c: 1 } } });
    const [slicedSignal, setSliced] = makeSlicedSignalFrom([sourceSignal, setSource])
      .access("a")
      .access("b")
      .done();

    const sourceSubscriber = jest.fn();
    const slicedSubscriber = jest.fn();
    sourceSignal.subscribeFull(sourceSubscriber);
    slicedSignal.subscribeFull(slicedSubscriber);

    setSliced.withProducer(draft => {
      draft.c = 2;
    });

    expect(sourceSubscriber).toHaveBeenCalledWith(
      { a: { b: { c: 2 } } },
      [
        {
          op: "replace",
          path: ["a", "b", "c"],
          value: 2,
        },
      ],
      [],
    );
    expect(slicedSubscriber).toHaveBeenCalledWith(
      { c: 2 },
      [
        {
          op: "replace",
          path: ["c"],
          value: 2,
        },
      ],
      [],
    );

    setSliced({ c: 3 });

    expect(sourceSubscriber).toHaveBeenCalledWith(
      { a: { b: { c: 3 } } },
      [
        {
          op: "replace",
          path: ["a", "b"],
          value: { c: 3 },
        },
      ],
      [],
    );
    expect(slicedSubscriber).toHaveBeenCalledWith(
      { c: 3 },
      [
        {
          op: "replace",
          path: [],
          value: { c: 3 },
        },
      ],
      [],
    );
  });

  it("should properly preserve tags", () => {
    const [sourceSignal, setSource] = Signal.create({ a: { b: { c: 1 } } });
    const [slicedSignal, setSliced] = makeSlicedSignalFrom([sourceSignal, setSource])
      .access("a")
      .access("b")
      .done();

    const subscriber = jest.fn();
    slicedSignal.subscribeFull(subscriber);

    setSliced({ c: 2 }, ["tag1", "tag2"]);

    expect(subscriber).toHaveBeenCalledWith(
      { c: 2 },
      [
        {
          op: "replace",
          path: [],
          value: { c: 2 },
        },
      ],
      ["tag1", "tag2"],
    );
  });

  it("should isolate tags from different slices", () => {
    const [sourceSignal, setSource] = Signal.create({ a: { b: { c: 1 } } });
    const [sliced1Signal, setSliced1] = makeSlicedSignalFrom([sourceSignal, setSource])
      .access("a")
      .access("b")
      .done();
    const [sliced2Signal, _setSliced2] = makeSlicedSignalFrom([sourceSignal, setSource])
      .access("a")
      .access("b")
      .done();

    const subscriber1 = jest.fn();
    sliced1Signal.subscribeFull(subscriber1);

    const subscriber2 = jest.fn();
    sliced2Signal.subscribeFull(subscriber2);

    setSliced1({ c: 2 }, ["tag1", "tag2"]);

    expect(subscriber1).toHaveBeenCalledWith(
      { c: 2 },
      [
        {
          op: "replace",
          path: [],
          value: { c: 2 },
        },
      ],
      ["tag1", "tag2"],
    );

    expect(subscriber2).toHaveBeenCalledWith(
      { c: 2 },
      [
        {
          op: "replace",
          path: [],
          value: { c: 2 },
        },
      ],
      [],
    );
  });

  it("should work with lazy signals", async () => {
    let setDownstream: Setter<{ a: { b: { c: number } } }>;
    const lazy = LazySignal.createWithoutInitialValue<{
      a: { b: { c: number } };
    }>(actualSetDownstream => {
      setDownstream = actualSetDownstream;
      return () => {};
    });

    const setterUpdateFn = jest.fn();

    const setter = makeSetterWithPatches<{ a: { b: { c: number } } } | NotAvailable>(
      setterUpdateFn,
    );

    const [slicedSignal, setSliced] = makeSlicedSignalFrom([lazy, setter])
      .access("a")
      .access("b")
      .done();

    const slicedSubscriber = jest.fn();
    slicedSignal.subscribeFull(slicedSubscriber);

    expect(slicedSubscriber).not.toHaveBeenCalled();
    expect(slicedSignal.get()).toBe(LazySignal.NOT_AVAILABLE);

    const lazySubscriber = jest.fn();
    lazy.subscribeFull(lazySubscriber);

    setDownstream!({ a: { b: { c: 1 } } });

    expect(slicedSubscriber).toHaveBeenCalledWith(
      { c: 1 },
      [
        {
          op: "replace",
          path: [],
          value: { c: 1 },
        },
      ],
      [],
    );

    expect(setterUpdateFn).not.toHaveBeenCalled();

    setSliced.withProducer(draft => {
      draft.c = 2;
    });

    expect(setterUpdateFn).toHaveBeenCalled();
    const updater = setterUpdateFn.mock.calls[0][0];
    expect(updater).toBeInstanceOf(Function);

    setDownstream!.withPatchUpdater(updater);

    expect(lazySubscriber).toHaveBeenCalledWith(
      { a: { b: { c: 2 } } },
      [
        {
          op: "replace",
          path: ["a", "b", "c"],
          value: 2,
        },
      ],
      [],
    );
  });
});