import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Viewer3D from "../Viewer3D";

type MockFn = ReturnType<typeof vi.fn>;

interface SceneMocks {
  camera: {
    setPosition: MockFn;
    setViewUp: MockFn;
    setFocalPoint: MockFn;
  };
  renderer: {
    addVolume: MockFn;
    resetCamera: MockFn;
    getActiveCamera: MockFn;
  };
  renderWindow: {
    render: MockFn;
  };
  interactor: {
    unbindEvents: MockFn;
  };
  fullScreenRenderer: {
    getRenderer: MockFn;
    getRenderWindow: MockFn;
    getInteractor: MockFn;
    delete: MockFn;
  };
  mapper: {
    setInputData: MockFn;
    setSampleDistance: MockFn;
  };
  property: {
    setRGBTransferFunction: MockFn;
    setScalarOpacity: MockFn;
    setInterpolationTypeToLinear: MockFn;
    setShade: MockFn;
    setAmbient: MockFn;
    setDiffuse: MockFn;
    setSpecular: MockFn;
    setSpecularPower: MockFn;
  };
  actor: {
    setMapper: MockFn;
    getProperty: MockFn;
  };
  ctfun: {
    addRGBPoint: MockFn;
    removeAllPoints: MockFn;
  };
  ofun: {
    addPoint: MockFn;
    removeAllPoints: MockFn;
  };
}

const vtkMocks = vi.hoisted(() => {
  const scenes: SceneMocks[] = [];
  let currentScene: SceneMocks | null = null;

  const createScene = (): SceneMocks => {
    const camera = {
      setPosition: vi.fn(),
      setViewUp: vi.fn(),
      setFocalPoint: vi.fn(),
    };

    const renderer = {
      addVolume: vi.fn(),
      resetCamera: vi.fn(),
      getActiveCamera: vi.fn(() => camera),
    };

    const renderWindow = {
      render: vi.fn(),
    };

    const interactor = {
      unbindEvents: vi.fn(),
    };

    const fullScreenRenderer = {
      getRenderer: vi.fn(() => renderer),
      getRenderWindow: vi.fn(() => renderWindow),
      getInteractor: vi.fn(() => interactor),
      delete: vi.fn(),
    };

    const mapper = {
      setInputData: vi.fn(),
      setSampleDistance: vi.fn(),
    };

    const property = {
      setRGBTransferFunction: vi.fn(),
      setScalarOpacity: vi.fn(),
      setInterpolationTypeToLinear: vi.fn(),
      setShade: vi.fn(),
      setAmbient: vi.fn(),
      setDiffuse: vi.fn(),
      setSpecular: vi.fn(),
      setSpecularPower: vi.fn(),
    };

    const actor = {
      setMapper: vi.fn(),
      getProperty: vi.fn(() => property),
    };

    const ctfun = {
      addRGBPoint: vi.fn(),
      removeAllPoints: vi.fn(),
    };

    const ofun = {
      addPoint: vi.fn(),
      removeAllPoints: vi.fn(),
    };

    const scene: SceneMocks = {
      camera,
      renderer,
      renderWindow,
      interactor,
      fullScreenRenderer,
      mapper,
      property,
      actor,
      ctfun,
      ofun,
    };

    scenes.push(scene);
    return scene;
  };

  const createAndSetCurrentScene = (): SceneMocks => {
    currentScene = createScene();
    return currentScene;
  };

  const getCurrentScene = (): SceneMocks => {
    if (!currentScene) {
      currentScene = createScene();
    }
    return currentScene;
  };

  const reset = (): void => {
    scenes.length = 0;
    currentScene = null;
  };

  const fullScreenNewInstance = vi.fn(() => createAndSetCurrentScene().fullScreenRenderer);
  const volumeMapperNewInstance = vi.fn(() => getCurrentScene().mapper);
  const volumeNewInstance = vi.fn(() => getCurrentScene().actor);
  const colorTransferNewInstance = vi.fn(() => getCurrentScene().ctfun);
  const piecewiseNewInstance = vi.fn(() => getCurrentScene().ofun);

  return {
    scenes,
    reset,
    fullScreenNewInstance,
    volumeMapperNewInstance,
    volumeNewInstance,
    colorTransferNewInstance,
    piecewiseNewInstance,
  };
});

vi.mock("@kitware/vtk.js/Rendering/OpenGL/Profiles/Volume", () => ({}));

vi.mock("@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow", () => ({
  default: {
    newInstance: vtkMocks.fullScreenNewInstance,
  },
  vtkFullScreenRenderWindow: {},
}));

vi.mock("@kitware/vtk.js/Rendering/Core/VolumeMapper", () => ({
  default: {
    newInstance: vtkMocks.volumeMapperNewInstance,
  },
}));

vi.mock("@kitware/vtk.js/Rendering/Core/Volume", () => ({
  default: {
    newInstance: vtkMocks.volumeNewInstance,
  },
  vtkVolume: {},
}));

vi.mock("@kitware/vtk.js/Rendering/Core/ColorTransferFunction", () => ({
  default: {
    newInstance: vtkMocks.colorTransferNewInstance,
  },
  vtkColorTransferFunction: {},
}));

vi.mock("@kitware/vtk.js/Common/DataModel/PiecewiseFunction", () => ({
  default: {
    newInstance: vtkMocks.piecewiseNewInstance,
  },
  vtkPiecewiseFunction: {},
}));

describe("Viewer3D", () => {
  beforeEach(() => {
    vtkMocks.reset();
    vi.clearAllMocks();
    delete (globalThis as any).__PLAYWRIGHT_TEST__;
  });

  it("uses Playwright fallback path without initializing VTK", async () => {
    (globalThis as any).__PLAYWRIGHT_TEST__ = true;
    const onReady = vi.fn();

    render(<Viewer3D vtkImage={{} as any} onReady={onReady} />);

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(vtkMocks.fullScreenNewInstance).not.toHaveBeenCalled();
    expect(await screen.findByTitle("Reset camera")).toBeInTheDocument();
  });

  it("initializes VTK pipeline and calls onReady", () => {
    const onReady = vi.fn();
    const vtkImage = {} as any;

    render(<Viewer3D vtkImage={vtkImage} onReady={onReady} />);

    const scene = vtkMocks.scenes[0];
    expect(scene).toBeDefined();
    expect(vtkMocks.fullScreenNewInstance).toHaveBeenCalledTimes(1);
    expect(scene.mapper.setInputData).toHaveBeenCalledWith(vtkImage);
    expect(scene.mapper.setSampleDistance).toHaveBeenCalledWith(1);
    expect(scene.actor.setMapper).toHaveBeenCalledWith(scene.mapper);
    expect(scene.renderer.addVolume).toHaveBeenCalledWith(scene.actor);
    expect(scene.renderer.resetCamera).toHaveBeenCalled();
    expect(scene.renderWindow.render).toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("updates transfer functions when level/window changes", async () => {
    const onReady = vi.fn();
    const vtkImage = {} as any;
    const { rerender } = render(
      <Viewer3D vtkImage={vtkImage} window={4000} level={300} onReady={onReady} />,
    );

    const scene = vtkMocks.scenes[0];
    scene.ctfun.removeAllPoints.mockClear();
    scene.ofun.removeAllPoints.mockClear();
    scene.ctfun.addRGBPoint.mockClear();
    scene.ofun.addPoint.mockClear();
    scene.renderWindow.render.mockClear();

    rerender(
      <Viewer3D vtkImage={vtkImage} window={4200} level={500} onReady={onReady} />,
    );

    await waitFor(() => {
      expect(scene.ctfun.removeAllPoints).toHaveBeenCalledTimes(1);
      expect(scene.ofun.removeAllPoints).toHaveBeenCalledTimes(1);
      expect(scene.ctfun.addRGBPoint).toHaveBeenCalledWith(300, 0, 0, 0);
      expect(scene.ctfun.addRGBPoint).toHaveBeenCalledWith(500, 0.6, 0.5, 0.4);
      expect(scene.ofun.addPoint).toHaveBeenCalledWith(300, 0);
      expect(scene.ofun.addPoint).toHaveBeenCalledWith(500, 0.3);
      expect(scene.renderWindow.render).toHaveBeenCalledTimes(1);
    });
  });

  it("resets camera when reset button is clicked", async () => {
    render(<Viewer3D vtkImage={{} as any} />);

    const scene = vtkMocks.scenes[0];
    scene.renderer.resetCamera.mockClear();
    scene.camera.setPosition.mockClear();
    scene.camera.setViewUp.mockClear();
    scene.camera.setFocalPoint.mockClear();
    scene.renderWindow.render.mockClear();

    const resetButton = await screen.findByTitle("Reset camera");
    fireEvent.click(resetButton);

    expect(scene.renderer.resetCamera).toHaveBeenCalledTimes(2);
    expect(scene.camera.setPosition).toHaveBeenCalledWith(0, 0, 1);
    expect(scene.camera.setViewUp).toHaveBeenCalledWith(0, 1, 0);
    expect(scene.camera.setFocalPoint).toHaveBeenCalledWith(0, 0, 0);
    expect(scene.renderWindow.render).toHaveBeenCalledTimes(1);
  });

  it("cleans up interactor events and renderer on unmount", () => {
    const { unmount } = render(<Viewer3D vtkImage={{} as any} />);

    const scene = vtkMocks.scenes[0];
    unmount();

    expect(scene.interactor.unbindEvents).toHaveBeenCalledTimes(1);
    expect(scene.fullScreenRenderer.delete).toHaveBeenCalledTimes(1);
  });
});