import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CourseIdentityEditor } from "@/components/course-identity-editor";
import { CourseLearning } from "@/components/course-learning";
import { GeneratedCourseView } from "@/components/generated-course-view";
import { getLearningState } from "@/lib/course-learning";
import { genRef } from "@/lib/enrollments";
import { getMyCourse } from "@/lib/library";
import { getSessionUser } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getSessionUser();
  const item = user ? await getMyCourse(user.id, id) : null;
  return item
    ? { title: item.title, description: item.course.oneLiner }
    : { title: "Course" };
}

export default async function GeneratedCoursePage({ params }: Props) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/courses/g/${id}`)}`);

  const item = await getMyCourse(user.id, id);
  if (!item) notFound();

  const signInHref = `/signin?next=${encodeURIComponent(`/courses/g/${id}`)}`;
  const ref = genRef(id);
  const state = await getLearningState(user, ref, item.course, signInHref);

  return (
    <div className="wrap py-10 sm:py-14">
      <Link href="/library" className="text-sm text-ink-2 hover:text-ink">
        ← My library
      </Link>
      <div className="mt-6">
        <GeneratedCourseView
          course={item.course}
          signInHref={signInHref}
          titleAs="h1"
          imageUrl={item.imageUrl}
          identity={
            <CourseIdentityEditor
              courseId={item.id}
              title={item.course.title}
              icon={item.course.icon}
              imageUrl={item.imageUrl}
            />
          }
          aside={
            <CourseLearning
              courseRef={ref}
              title={item.course.title}
              modules={item.course.syllabus}
              state={state}
            />
          }
        />
      </div>
    </div>
  );
}
