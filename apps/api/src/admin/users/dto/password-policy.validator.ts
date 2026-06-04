import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'PasswordPolicy', async: false })
export class PasswordPolicyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length < 12) {
      return false;
    }

    const classes = [
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value),
    ];

    return classes.filter(Boolean).length >= 3;
  }

  defaultMessage(): string {
    return 'パスワードは12文字以上で、英大文字・英小文字・数字・記号のうち3種類以上を含めてください';
  }
}
