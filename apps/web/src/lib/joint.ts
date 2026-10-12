// Compares a learner's and a parent's answers to the same questions, without judging either side.
export const JOINT_QUESTIONS = ['preferred_trade', 'top_priority', 'preferred_location'] as const;
export type JointQuestion = (typeof JOINT_QUESTIONS)[number];
export type JointAnswers = Partial<Record<JointQuestion, number>>; // option index per question

export function compareAnswers(learner: JointAnswers, parent: JointAnswers) {
  const agreements = JOINT_QUESTIONS.filter((q) => learner[q] !== undefined && learner[q] === parent[q]);
  const disagreements = JOINT_QUESTIONS.filter((q) => !agreements.includes(q));
  return { agreements, disagreements, has_disagreement: disagreements.length > 0 };
}

export const isComplete = (a: JointAnswers) => JOINT_QUESTIONS.every((q) => a[q] !== undefined);
