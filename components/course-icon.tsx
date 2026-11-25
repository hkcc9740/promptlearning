/** A course's face: the learner's uploaded image if any, else its emoji. */
export function CourseIcon({
  icon,
  imageUrl,
  size = "md",
}: {
  icon: string;
  imageUrl?: string | null;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-16 w-16 text-3xl" : "h-14 w-14 text-3xl";
  return imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      className={`${box} shrink-0 rounded-2xl border border-line object-cover bg-white`}
    />
  ) : (
    <div
      aria-hidden
      className={`${box} grid shrink-0 place-items-center rounded-2xl bg-white border border-line`}
    >
      {icon}
    </div>
  );
}
