import * as React from 'react'
import {withDocument} from 'part:@sanity/form-builder'
import {Flex, Box, Stack, Label, Button, Switch, studioTheme, ThemeProvider} from '@sanity/ui'

import {SanityDocument} from '@sanity/types'
// import {studioTheme, ThemeProvider} from '@sanity/ui'
import PatchEvent, {set, unset} from 'part:@sanity/form-builder/patch-event'
import DefaultFormField from 'part:@sanity/components/formfields/default'
import DefaultTextInput from 'part:@sanity/components/textinputs/default'
import branchSdk, {DeepLinkData} from 'branch-sdk'
import {Marker, Path, isValidationErrorMarker} from '@sanity/types'
export interface DeepLinkParams extends DeepLinkData {
  type?: 0 | 1 | 2
  alias?: string
}

export type Props = {
  type: {
    _type?: 'url'
    title: string
    description?: string
    name: string
    options?: {
      branchKey: string
      baseUrl: string
      getLinkParams: (document: SanityDocument) => DeepLinkParams
    }
  }
  document: SanityDocument
  level: number
  options: {[s: string]: any}
  value?: string | undefined
  onChange: (ev: any) => void
  // Note: we should allow implementors of custom inputs to forward the passed onFocus to native element's onFocus handler,
  // but use Path consistently on internal inputs
  onFocus: (path?: Path | React.FocusEvent<any>) => void
  onBlur?: () => void
  markers: Marker[]
  presence: any[]
}

// type LinkParams = {}

const initializeBranch = async (branchKey: string) => {
  return await new Promise((resolve, reject) => {
    branchSdk.init(
      branchKey,
      {
        no_journeys: true,
        tracking_disabled: true,
        disable_exit_animation: true,
        disable_entry_animation: true,
      },
      (err) => {
        if (err) {
          return reject(err)
        }
        return resolve(null)
      }
    )
  })
}

const useBranchSdk = (options: Props['type']['options'], onChange: (ev: any) => void) => {
  const [error, setError] = React.useState<string>()
  const {branchKey, getLinkParams} = options || {}
  React.useEffect(() => {
    if (!getLinkParams) {
      setError('options.getLinkParams required')
    }
  }, [getLinkParams])
  React.useEffect(() => {
    if (!branchKey) {
      return setError('options.branchKey required')
    }
    initializeBranch(branchKey)
      .then(() => {})
      .catch(setError)
  }, [branchKey])

  const updateLink = React.useCallback(
    (document, value, shorten) => {
      fetchLink(document, options, shorten)
        .then((link) => {
          if (link) {
            if (link !== value) onChange(link)
          }
        })
        .catch(setError)
    },
    [options?.getLinkParams, setError]
  )
  return {
    error,
    updateLink,
  }
}

const makeLink = (params: DeepLinkData): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    branchSdk.link(params, (err, link) => {
      if (err) {
        reject(err)
      } else {
        resolve(link)
      }
    })
  })
}

const fetchLink = async (
  document: SanityDocument,
  options?: Props['options'],
  shorten = false
): Promise<string | null> => {
  if (options?.getLinkParams) {
    if (!document._id) {
      return ''
    }
    const params: DeepLinkData = await options.getLinkParams(document)
    for (const key in params) {
      //Clean up any
      const parameters = params as any
      if (parameters[key] === '' || parameters[key] === undefined) {
        delete parameters[key]
      }
    }
    if (params.data?.alias) {
      //There is a bug in branch SDK, where alias is listed under the 'data' type
      ;(params as any).alias = params.data.alias
      delete params.data.alias
    }
    if (shorten) {
      return await makeLink(params)
    }
    const searchParams = new URLSearchParams(params.data)
    return `${options.baseUrl}?${searchParams.toString()}`
  }
  return null
}
const BranchLinkField = React.forwardRef(
  (props: Props, forwardedRef: React.ForwardedRef<HTMLInputElement>) => {
    const {type, level, onFocus, onBlur, value, markers, presence} = props
    const [shouldShorten, setShouldShorten] = React.useState(value && value.length < 43)
    const handleChange = React.useCallback(
      (val) => {
        props.onChange(PatchEvent.from(val ? set(val) : unset()))
      },
      [props.onChange, type.name]
    )
    const {error, updateLink} = useBranchSdk(type.options, handleChange)
    const errors = React.useMemo(() => markers.filter(isValidationErrorMarker), [markers])
    const strValue = value || ''

    React.useEffect(() => {
      if (!value && props.document._id) {
        updateLink(props.document, value, shouldShorten)
      }
    }, [value, props.document._id])
    const expressedError = errors?.[0]?.item.message || error

    const onChange = React.useCallback((e) => handleChange(e.target.value), [handleChange])
    return (
      <ThemeProvider theme={studioTheme}>
        <DefaultFormField
          label={type.title || type.name}
          description={type.description}
          level={level}
          // Necessary for validation warnings to show up contextually
          markers={props.markers}
          // Necessary for presence indication
          presence={presence}
        >
          <Stack space={3}>
            <DefaultTextInput
              value={strValue}
              type="text"
              disabled
              onFocus={onFocus}
              onBlur={onBlur}
              customValidity={expressedError}
              onChange={onChange}
              ref={forwardedRef}
            />
            <Flex align="center">
              <Box marginRight={1}>
                <Button
                  mode="ghost"
                  type="button"
                  text="Update"
                  onClick={() => updateLink(props.document, value, shouldShorten)}
                  onFocus={onFocus}
                />
              </Box>
              <Box>
                <Switch
                  checked={shouldShorten}
                  onChange={() => {
                    setShouldShorten(!shouldShorten)
                    updateLink(props.document, value, !shouldShorten)
                  }}
                />
                <Label muted>Shorten</Label>
              </Box>
            </Flex>
          </Stack>
        </DefaultFormField>
      </ThemeProvider>
    )
  }
)

export default withDocument(BranchLinkField)
