// Server-only: load the course behind a course ref (catalog or generated).
import { getCourse } from "@/lib/courses";
import type { CourseRef } from "@/lib/enrollments";
import type { LessonCourse } from "@/lib/lessons";
import { getMyCourse } from "@/lib/library";

export type LoadedCourse = { path: string; course: LessonCourse };

export async function loadCourse(userId: string, ref: CourseRef): Promise<LoadedCourse | null> {
  if (ref.startsWith("static:")) {
    const course = getCourse(ref.slice("static:".length));
    return course?.published ? { path: `/courses/${course.slug}`, course } : null;
  }
  const item = await getMyCourse(userId, ref.slice("gen:".length));
  return item ? { path: `/courses/g/${item.id}`, course: item.course } : null;
}
