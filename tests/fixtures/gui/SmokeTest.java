import graider.gui.GuiSmoke;
import javafx.application.Application;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import org.junit.jupiter.api.Test;

public class SmokeTest {
    public static class App extends Application {
        @Override public void start(Stage stage) throws Exception {
            String scenario = System.getenv("GUI_SCENARIO");
            if ("startup".equals(scenario)) Thread.sleep(60000);
            Button button = new Button("Click"); button.setId("action");
            Label label = new Label("Before"); label.setId("result");
            button.setOnAction(event -> label.setText("After"));
            stage.setScene(new Scene(new VBox(button, label), 300, 200));
            if (!"hidden".equals(scenario)) stage.show();
        }
        @Override public void stop() throws Exception {
            if ("shutdown".equals(System.getenv("GUI_SCENARIO"))) Thread.sleep(60000);
        }
    }
    @Test public void interaction() throws Exception {
        GuiSmoke.verify(App.class, "#action", stage -> {
            if ("assertion".equals(System.getenv("GUI_SCENARIO"))
                    && "After".equals(((Label) stage.getScene().lookup("#result")).getText())) {
                throw new AssertionError("fixture assertion failure");
            }
            String expected = "interaction".equals(System.getenv("GUI_SCENARIO")) ? "Never" : "After";
            return expected.equals(((Label) stage.getScene().lookup("#result")).getText());
        });
    }
}
