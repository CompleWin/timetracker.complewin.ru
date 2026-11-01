const nameCollator = new Intl.Collator("ru", { sensitivity: "accent" });

type Created = { createdAt: Date };

export function sortByName<Row extends Created>(rows: Row[], nameOf: (row: Row) => string): Row[] {
  return rows.toSorted(
    (a, b) =>
      nameCollator.compare(nameOf(a), nameOf(b)) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
