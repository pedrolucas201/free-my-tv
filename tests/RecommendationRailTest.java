package io.freemytv;

public final class RecommendationRailTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        for (int count : new int[] {1, 2, 3, 24, 200}) {
            float offset = 0;
            for (int index = 0; index < count; index++) {
                offset = RecommendationRail.scrollFor(index, count, offset, 720, 40, 1760);
                check(index * 760 >= offset, "Focused card clipped at the left edge");
                check(index * 760 + 720 <= offset + 1760, "Focused card clipped at the right edge");
                float appended = RecommendationRail.scrollFor(index, count + 20, offset, 720, 40, 1760);
                check(appended == offset, "Appending a page moved the focused card");
            }
            for (int index = count - 1; index >= 0; index--) {
                offset = RecommendationRail.scrollFor(index, count, offset, 720, 40, 1760);
                check(index * 760 >= offset && index * 760 + 720 <= offset + 1760,
                        "Returning left lost the focused card");
            }
            check(offset == 0, "Returning to the first title did not reset the row");
            check(RecommendationRail.scrollFor(0, 1, 50000, 720, 40, 1760) == 0,
                    "Switching to a short tab retained the old scroll position");
        }
        check(RecommendationRail.scrollFor(0, 0, 100, 720, 40, 1760) == 0, "Empty row did not reset");
        System.out.println("Recommendation rail: focus, append, reverse, short and empty rows passed.");
    }
}
