/** Optional faculty test API, compiled outside student source roots. */
export const javaGuiSmokeHelper = String.raw`package graider.gui;

import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.function.Predicate;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Bounds;
import javafx.scene.Node;
import javafx.scene.input.MouseButton;
import javafx.scene.robot.Robot;
import javafx.stage.Stage;
import javafx.stage.Window;

/** A real mouse click and a bounded observable assertion against a student Application. */
public final class GuiSmoke {
    private static final int STARTUP_SECONDS = 15;
    private static final int INTERACTION_SECONDS = 10;
    private static final int SHUTDOWN_SECONDS = 5;
    private static final int POLL_MILLIS = 50;
    private static boolean initialized;
    private GuiSmoke() { }

    private static void event(String event) throws Exception {
        String journal = System.getenv("GRAIDER_GUI_JOURNAL");
        if (journal == null) throw new IllegalStateException("Run through the managed Graider workflow");
        Files.writeString(Path.of(journal), event + "\n", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    private static <T> T onFx(Callable<T> operation, int seconds, String phase) throws Exception {
        FutureTask<T> task = new FutureTask<>(operation);
        Platform.runLater(task);
        try {
            return task.get(seconds, TimeUnit.SECONDS);
        } catch (TimeoutException exception) {
            throw new AssertionError("GUI " + phase + " timed out after " + seconds + " seconds", exception);
        }
    }

    /** Call from a JUnit test thread. The assertion must observe a change caused by the click. */
    public static synchronized void verify(Class<? extends Application> applicationClass,
            String clickSelector, Predicate<Stage> observedResult) throws Exception {
        if (Platform.isFxApplicationThread()) throw new IllegalStateException("Call GuiSmoke from the JUnit thread");
        event("started");
        Application application = applicationClass.getDeclaredConstructor().newInstance();
        try {
            if (!initialized) {
                CountDownLatch ready = new CountDownLatch(1);
                Platform.startup(() -> { Platform.setImplicitExit(false); ready.countDown(); });
                if (!ready.await(STARTUP_SECONDS, TimeUnit.SECONDS)) {
                    throw new AssertionError("GUI startup timed out");
                }
                initialized = true;
            }
            // init() also has a deadline: faculty/student initialization must never hang the runner.
            ExecutorService initializer = Executors.newSingleThreadExecutor(r -> {
                Thread thread = new Thread(r, "graider-gui-init"); thread.setDaemon(true); return thread;
            });
            try {
                initializer.submit(() -> { application.init(); return null; })
                        .get(STARTUP_SECONDS, TimeUnit.SECONDS);
            } finally { initializer.shutdownNow(); }
            Stage stage = onFx(() -> {
                Stage window = new Stage(); application.start(window);
                if (!window.isShowing() || window.getScene() == null
                        || window.getScene().getWindow() != window) {
                    throw new AssertionError("GUI startup: Application must show a Stage with a Scene");
                }
                return window;
            }, STARTUP_SECONDS, "startup");
            event("launch");
            onFx(() -> {
                if (observedResult.test(stage)) {
                    throw new AssertionError("GUI assertion was already true before interaction");
                }
                Node target = stage.getScene().lookup(clickSelector);
                if (target == null || !target.isVisible() || target.isDisabled()) {
                    throw new AssertionError("GUI interaction: selector must identify a visible enabled node");
                }
                Bounds bounds = target.localToScreen(target.getBoundsInLocal());
                if (bounds == null || bounds.getWidth() <= 0 || bounds.getHeight() <= 0) {
                    throw new AssertionError("GUI interaction: target has no screen bounds");
                }
                stage.toFront(); stage.requestFocus();
                Robot robot = new Robot();
                robot.mouseMove(bounds.getCenterX(), bounds.getCenterY());
                robot.mousePress(MouseButton.PRIMARY); robot.mouseRelease(MouseButton.PRIMARY);
                return null;
            }, INTERACTION_SECONDS, "interaction");
            event("interaction");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(INTERACTION_SECONDS);
            boolean observed = false;
            do {
                observed = onFx(() -> stage.isShowing() && observedResult.test(stage),
                        INTERACTION_SECONDS, "assertion");
                if (!observed) Thread.sleep(POLL_MILLIS);
            } while (!observed && System.nanoTime() < deadline);
            if (!observed) throw new AssertionError("GUI interaction/assertion timed out: expected UI change was not observed");
            event("assertion");
        } finally {
            if (initialized) {
                onFx(() -> {
                    application.stop();
                    for (Window window : java.util.List.copyOf(Window.getWindows())) window.hide();
                    return null;
                }, SHUTDOWN_SECONDS, "shutdown");
                event("shutdown");
            }
        }
        event("passed");
    }
}
`;
