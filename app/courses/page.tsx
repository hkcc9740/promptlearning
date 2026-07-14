import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedCourses, getCategories } from "@/lib/courses";
import { CourseCard } from "@/components/course-card";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse every prompt-course — paste one into your AI and start learning.",
};

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const all = getPublishedCourses();
  const categories = getCategories();
  const active = category && categories.includes(category) ? category : null;
  const courses = active ? all.filter((c) => c.category === active) : all;

  return (
    <div className="wrap py-16">
      <header className="max-w-2xl mb-10">
        <span className="eyebrow mb-4">The library</span>
        <h1 className="text-4xl sm:text-5xl mb-4">Every course is one prompt away.</h1>
        <p className="text-lg text-ink-2 leading-relaxed">
          Pick one, copy its prompt, and paste it into ChatGPT or Claude. Each is
          engineered as a full curriculum — not a clever one-liner.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-10">
        <FilterChip href="/courses" label="All" active={!active} />
        {categories.map((c) => (
          <FilterChip
            key={c}
            href={`/courses?category=${encodeURIComponent(c)}`}
            label={c}
            active={active === c}
          />
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} />
        ))}
      </div>
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="rounded-full px-4 py-2 text-sm font-medium border transition-colors"
      style={
        active
          ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }
          : { background: "transparent", color: "var(--ink-2)", borderColor: "var(--line-strong)" }
      }
    >
      {label}
    </Link>
  );
}
