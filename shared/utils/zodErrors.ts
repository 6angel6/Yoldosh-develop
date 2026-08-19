import { ZodError } from 'zod';

export const formatZodError = (error: ZodError) => {
   const formattedErrors: { [key: string]: string } = {};
   error.issues.forEach((issue) => {
      const fieldName = issue.path.join('.');
      formattedErrors[fieldName] = issue.message;
   });
   return formattedErrors;
};
