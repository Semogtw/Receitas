export function executableSource(content) {
  const output = []
  const templateExpressionDepth = []
  let state = 'code'

  const mask = (character) => output.push(character === '\n' ? '\n' : ' ')

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    const next = content[index + 1]

    if (state === 'line-comment') {
      mask(character)
      if (character === '\n') state = 'code'
      continue
    }

    if (state === 'block-comment') {
      mask(character)
      if (character === '*' && next === '/') {
        mask(next)
        index += 1
        state = 'code'
      }
      continue
    }

    if (state === 'single-quote' || state === 'double-quote') {
      mask(character)
      if (character === '\\' && next !== undefined) {
        mask(next)
        index += 1
        continue
      }
      if ((state === 'single-quote' && character === "'") || (state === 'double-quote' && character === '"')) {
        state = 'code'
      }
      continue
    }

    if (state === 'template') {
      mask(character)
      if (character === '\\' && next !== undefined) {
        mask(next)
        index += 1
        continue
      }
      if (character === '`') {
        state = 'code'
        continue
      }
      if (character === '$' && next === '{') {
        output.push('{')
        index += 1
        templateExpressionDepth.push(1)
        state = 'code'
      }
      continue
    }

    if (character === '/' && next === '/') {
      mask(character)
      mask(next)
      index += 1
      state = 'line-comment'
      continue
    }
    if (character === '/' && next === '*') {
      mask(character)
      mask(next)
      index += 1
      state = 'block-comment'
      continue
    }
    if (character === "'") {
      mask(character)
      state = 'single-quote'
      continue
    }
    if (character === '"') {
      mask(character)
      state = 'double-quote'
      continue
    }
    if (character === '`') {
      mask(character)
      state = 'template'
      continue
    }

    if (templateExpressionDepth.length > 0) {
      const current = templateExpressionDepth.length - 1
      if (character === '{') templateExpressionDepth[current] += 1
      if (character === '}') {
        templateExpressionDepth[current] -= 1
        if (templateExpressionDepth[current] === 0) {
          templateExpressionDepth.pop()
          output.push(character)
          state = 'template'
          continue
        }
      }
    }

    output.push(character)
  }

  return output.join('')
}
