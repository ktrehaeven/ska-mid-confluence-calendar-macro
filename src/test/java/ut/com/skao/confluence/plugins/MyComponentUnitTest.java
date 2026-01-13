package ut.com.skao.confluence.plugins;

import org.junit.Test;
import com.skao.confluence.plugins.api.MyPluginComponent;
import com.skao.confluence.plugins.impl.MyPluginComponentImpl;

import static org.junit.Assert.assertEquals;

public class MyComponentUnitTest {
    @Test
    public void testMyName() {
        MyPluginComponent component = new MyPluginComponentImpl(null);
        assertEquals("names do not match!", "myComponent", component.getName());
    }
}