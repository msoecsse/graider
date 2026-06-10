import type { ReactElement } from "react";
import { CourseTermCard } from "./CourseTermCard";
import type { CombinedDashboardCard } from "./dashboardTypes";

interface CourseCardGridProps {
  readonly cards: readonly CombinedDashboardCard[];
}

export const CourseCardGrid = ({ cards }: CourseCardGridProps): ReactElement | null => {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="course-card-section" aria-labelledby="course-cards-title">
      <div className="course-card-section__header">
        <h2 id="course-cards-title">Course-term cards</h2>
        <p>{cards.length === 1 ? "1 course-term loaded" : `${cards.length} course-terms loaded`}</p>
      </div>
      <div className="course-card-grid">
        {cards.map((card) => (
          <CourseTermCard combinedCard={card} key={card.id} />
        ))}
      </div>
    </section>
  );
};
