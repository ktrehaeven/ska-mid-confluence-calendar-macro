public class test {
    public static void main(String[] args) {
        com.skao.confluence.plugins.macro.SkaLowMap macro = new com.skao.confluence.plugins.macro.SkaLowMap();
        String html = macro.execute(null, null, null);
        System.out.println(html);
    }
}