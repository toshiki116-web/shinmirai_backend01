import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUnitDto } from './update-unit.dto';

async function validateDto(payload: Record<string, unknown>) {
  return validate(plainToInstance(UpdateUnitDto, payload));
}

describe('UpdateUnitDto status', () => {
  it.each(['normal', 'maintenance'])('accepts %s', async (status) => {
    await expect(validateDto({ status })).resolves.toHaveLength(0);
  });

  it.each(['warning', 'stop', 'deleted', ''])('rejects %s', async (status) => {
    const errors = await validateDto({ status });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it('accepts a payload without status', async () => {
    await expect(validateDto({ unitName: 'renamed' })).resolves.toHaveLength(0);
  });
});
