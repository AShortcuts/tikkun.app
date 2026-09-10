import { LeiningGenerator } from '../../../../app/calendar-model/generator.ts'
import { buildParshaPickerModel } from '../../../../app/components/parsha-picker-model.ts'

export function load() {
  const generator = new LeiningGenerator({
    ashkenazi: true,
    includeModernHolidays: false,
    israel: false,
  })
  return { books: buildParshaPickerModel(generator).parshaBooks }
}
