export const rooms = {
  user: (userId) => `user:${userId}`,
  school: (schoolId) => `school:${schoolId}`,
  courseStaff: (courseId) => `course:${courseId}:staff`,
};
