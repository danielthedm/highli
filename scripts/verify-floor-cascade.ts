import assert from "node:assert/strict";

type ScopeCounts = {
  company: string;
  total: number;
  departments: Array<{ key: string; count: number; division?: string | null }>;
  divisions: Array<{ key: string; count: number }>;
};

function resolveScopeFromCounts(counts: ScopeCounts, request: { type: string; key?: string }) {
  const qualifiedDepartments = counts.departments.filter((d) => d.count >= 25);
  const qualifiedDivisions = counts.divisions.filter((d) => d.count >= 25);
  const allowedScopes =
    counts.total >= 12
      ? [
          { type: "company", key: counts.company, count: counts.total },
          ...qualifiedDivisions.map((d) => ({ type: "division", key: d.key, count: d.count })),
          ...qualifiedDepartments.map((d) => ({
            type: "department",
            key: d.key,
            count: d.count,
          })),
        ]
      : [];
  if (request.type === "team") return { renderable: false, reason: "team-level-not-supported" };
  if (request.type === "arbitrary") {
    return { renderable: false, reason: "arbitrary-group-not-supported" };
  }
  if (counts.total < 12) return { renderable: false, reason: "company-too-small" };
  if (qualifiedDepartments.length === 0) {
    return request.type === "company"
      ? { renderable: true, reason: "ok", scopeType: "company", allowedScopes }
      : { renderable: false, reason: "no-department-qualified", allowedScopes };
  }
  if (request.type === "company") {
    return { renderable: true, reason: "ok", scopeType: "company", allowedScopes };
  }
  if (request.type === "department") {
    const department = qualifiedDepartments.find((d) => d.key === request.key);
    return department
      ? {
          renderable: true,
          reason: "ok",
          scopeType: "department",
          engineerCount: department.count,
          allowedScopes,
        }
      : { renderable: false, reason: "no-department-qualified", allowedScopes };
  }
  return { renderable: true, reason: "ok", scopeType: "division", allowedScopes };
}

function counts(total: number, departmentCounts: number[]): ScopeCounts {
  return {
    company: "Acme",
    total,
    departments: departmentCounts.map((count, index) => ({
      key: `Dept ${index + 1}`,
      count,
      division: "Engineering",
    })),
    divisions: [{ key: "Engineering", count: total }],
  };
}

assert.equal(
  resolveScopeFromCounts(counts(11, [11]), { type: "company" }).reason,
  "company-too-small",
);

const companyOnly = resolveScopeFromCounts(counts(18, [10, 8]), { type: "company" });
assert.equal(companyOnly.renderable, true);
assert.equal(companyOnly.scopeType, "company");
assert.equal(
  resolveScopeFromCounts(counts(18, [10, 8]), { type: "department", key: "Dept 1" }).reason,
  "no-department-qualified",
);

const dept = resolveScopeFromCounts(counts(52, [27, 25]), {
  type: "department",
  key: "Dept 1",
});
assert.equal(dept.renderable, true);
assert.equal(dept.scopeType, "department");
assert.equal(dept.engineerCount, 27);

assert.equal(
  resolveScopeFromCounts(counts(52, [27, 25]), { type: "team", key: "Platform Team" }).reason,
  "team-level-not-supported",
);
assert.equal(
  resolveScopeFromCounts(counts(52, [27, 25]), { type: "arbitrary", key: "people-with-label-x" })
    .reason,
  "arbitrary-group-not-supported",
);

console.log("floor cascade checks passed");
