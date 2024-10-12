const sdl = require("@kmamal/sdl");

const createWindow = (options) => {
  const window = sdl.video.createWindow(options);
  return window;
  // return { __type__: "Raw", value: window };
};

// const on = (eventName, window, fn, VM) => {
//   const vm = new VM([fn]);
//   const func = (...event) =>
//     vm.evaluateFunctionWithArgs(fn, [...event.map((e) => vm.jsToNode(e))]);

//   window.on(eventName, func);
// };

const on = (eventName, window, fn) => {
  const func = (...event) => fn(...event);
  window.on(eventName, func);
};

// const on = (eventName, window, fn, Evaluator) => {
//   const evaluator = new Evaluator([fn]);
//   const func = (...event) =>
//     evaluator.evaluateFunctionWithArgs(fn, [
//       ...event.map((e) => evaluator.jsToNode(e)),
//     ]);
//   window.on(eventName, func);
// };

const render = (window, width, height, stride, format, buffer) => {
  window.render(width, height, stride, format, buffer);
};

const run = (fn, Evaluator) => {
  const window = sdl.video.createWindow({ title: "Hello, World!" });
  const evaluator = new Evaluator([fn]);
  const func = (...event) =>
    evaluator.evaluateFunctionWithArgs(fn, [
      ...event.map((e) => evaluator.jsToNode(e)),
    ]);
  window.on("*", func);
};

const test = () => {
  const sdl = require("@kmamal/sdl");
  const window = sdl.video.createWindow({ title: "Hello, World!" });
  const f = (...e) => {
    console.log(...e);
  };
  window.on("*", f);
};

const test2 = () => {
  const sdl = require("@kmamal/sdl");
  const Canvas = require("canvas");

  const window = sdl.video.createWindow({ resizable: true });

  let canvas;
  let ctx;

  const redraw = () => {
    const { pixelWidth: width, pixelHeight: height } = window;

    ctx.font = `${Math.floor(height / 5)}px serif`;
    ctx.fillStyle = "red";
    ctx.textAlign = "center";
    ctx.fillText("Hello, World!", width / 2, height / 2);

    const buffer = canvas.toBuffer("raw");
    window.render(width, height, width * 4, "bgra32", buffer);
  };

  window.on("expose", redraw);

  window.on("resize", ({ pixelWidth: width, pixelHeight: height }) => {
    canvas = Canvas.createCanvas(width, height);
    ctx = canvas.getContext("2d");
    redraw();
  });
};

const buff = () => {
  const sdl = require("@kmamal/sdl");
  const window = sdl.video.createWindow({ resizable: true });

  const redraw = () => {
    const { pixelWidth: width, pixelHeight: height } = window;
    const stride = width * 4;
    const buffer = Buffer.alloc(stride * height);

    let offset = 0;
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        buffer[offset++] = Math.floor((256 * i) / height); // R
        buffer[offset++] = Math.floor((256 * j) / width); // G
        buffer[offset++] = 0; // B
        buffer[offset++] = 255; // A
      }
    }

    window.render(width, height, stride, "rgba32", buffer);
  };

  window.on("resize", redraw).on("expose", redraw);
};

const sineWav = () => {
  const sdl = require("@kmamal/sdl");
  const TWO_PI = 2 * Math.PI;

  const playbackInstance = sdl.audio.openDevice({ type: "playback" });
  const {
    channels,
    frequency,
    bytesPerSample,
    minSampleValue,
    maxSampleValue,
    zeroSampleValue,
  } = playbackInstance;
  const range = maxSampleValue - minSampleValue;
  const amplitude = range / 2;

  const sineAmplitude = 0.3 * amplitude;
  const sineNote = 440;
  const sinePeriod = 1 / sineNote;

  const duration = 3;
  const numFrames = duration * frequency;
  const numSamples = numFrames * channels;
  const numBytes = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(numBytes);

  let offset = 0;
  for (let i = 0; i < numFrames; i++) {
    const time = i / frequency;
    const angle = (time / sinePeriod) * TWO_PI;
    const sample = zeroSampleValue + Math.sin(angle) * sineAmplitude;
    for (let j = 0; j < channels; j++) {
      offset = playbackInstance.writeSample(buffer, sample, offset);
    }
  }

  playbackInstance.enqueue(buffer);
  playbackInstance.play();
};

const freq = async () => {
  const sdl = require("@kmamal/sdl");
  const Canvas = require("canvas");
  const { setTimeout } = require("timers/promises");

  const window = sdl.video.createWindow();
  const { pixelWidth: width, pixelHeight: height } = window;
  const canvas = Canvas.createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const channels = 1;
  const buffered = 128;
  const recordingInstance = sdl.audio.openDevice(
    { type: "recording" },
    {
      channels,
      buffered,
    }
  );
  const {
    frequency,
    bytesPerSample,
    minSampleValue,
    maxSampleValue,
    zeroSampleValue,
  } = recordingInstance;
  const range = maxSampleValue - minSampleValue;
  const amplitude = range / 2;

  const duration = 5;
  const numSamples = duration * frequency;
  const numBytes = numSamples * bytesPerSample;
  const audioBuffer = Buffer.alloc(numBytes, 0);

  recordingInstance.play();

  const supersampling = 4;

  while (!window.destroyed) {
    // Read new audio samples
    {
      const { queued } = recordingInstance;
      if (queued === 0) {
        await setTimeout(1);
        continue;
      }
      audioBuffer.copy(audioBuffer, 0, queued);
      recordingInstance.dequeue(audioBuffer.slice(-queued));
    }

    // Render
    {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "white";

      ctx.save();
      ctx.translate(0, height / 2);
      ctx.scale(1, -height / 2);
      ctx.lineWidth = 1 / width;
      {
        let min = 0;
        let max = 0;
        let lastX = -1;
        for (let i = 0; i < numSamples; i++) {
          const x = Math.floor((i / numSamples) * width * supersampling);

          if (x > lastX) {
            const y = (min - zeroSampleValue) / amplitude;
            const h = (max - min) / amplitude;
            ctx.fillRect(lastX / supersampling, y, 1, Math.max(1 / height, h));
            lastX = x;
            min = Infinity;
            max = -Infinity;
          }

          const sample = recordingInstance.readSample(
            audioBuffer,
            i * bytesPerSample
          );
          max = Math.max(max, sample);
          min = Math.min(min, sample);
        }
      }
      ctx.restore();

      const pixelBuffer = canvas.toBuffer("raw");
      window.render(width, height, width * 4, "bgra32", pixelBuffer);
    }

    await setTimeout(0);
  }
};

exports.test = test;
exports.test2 = test2;
exports.buff = buff;
exports.sineWav = sineWav;
exports.freq = freq;

exports.createWindow = createWindow;
exports.on = on;
exports.render = render;

exports.run = run;
